from types import SimpleNamespace

import httpx
from sqlalchemy import select

from app import worker
from app.models import Task, Attempt, Entry, Offering, Channel
from app.task_recovery import recovery_mode
from conftest import submit
from test_platform import execute_mock


def test_legacy_524_without_remote_id_is_manual_and_never_reposted(env):
    client, factory, ids = env
    task, _ = submit(client, ids)
    evidence = {'cloudflare_error': True, 'error_code': 524, 'status': 524}
    execute_mock(lambda request: httpx.Response(524, json=evidence))
    with factory() as db:
        saved = db.get(Task, task['id'])
        saved.error = '上游状态查询暂不可用，后台继续核对'
        saved.next_at = 0
        db.commit()
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'reconciling'
    assert result['recovery'] == {'mode': 'manual', 'automatic': False}
    assert '响应超时' in result['error'] and '人工核对' in result['error']
    assert '后台继续' not in result['error']
    assert result['billing']['status'] == 'pending' and result['billing']['amount'] is None
    assert worker.claim() is None
    with factory() as db:
        assert db.scalar(select(Attempt).where(Attempt.task_id == task['id'])).response == evidence
        assert db.get(Task, task['id']).error == '上游状态查询暂不可用，后台继续核对'
        assert not list(db.scalars(select(Entry).where(Entry.task_id == task['id'])))


def test_incomplete_async_200_without_task_id_does_not_resubmit(env):
    _, factory, ids = env
    with factory() as db:
        model = db.get(Offering, ids['offering'])
        model.adapter = 'json_async'
        model.config = {'submit_path': '/generate', 'status_path': '/tasks/{id}',
                        'body': {'model': '{{model}}'}, 'output_path': 'outputs'}
        db.commit()
    client = env[0]
    task, _ = submit(client, ids)
    execute_mock(lambda request: httpx.Response(200, json={'status': 'pending'}))
    with factory() as db:
        db.get(Task, task['id']).next_at = 0
        db.commit()
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['recovery']['mode'] == 'manual'
    assert worker.claim() is None


def test_polling_requires_remote_id_and_declared_query_route():
    attempt = SimpleNamespace(remote_id='job', state='unknown', response={})
    assert recovery_mode({'adapter': 'openai_image', 'config': {}}, attempt) == 'manual'
    assert recovery_mode({'adapter': 'json_async', 'config': {'status_path': '/tasks/{id}'}}, attempt) == 'poll'
    assert recovery_mode({'adapter': 'minimax_h3', 'config': {}}, attempt) == 'poll'
    attempt = SimpleNamespace(remote_id=None, state='response_received', response={'data': [{'url': 'https://provider.example/a.png'}]})
    assert recovery_mode({'adapter': 'openai_image', 'config': {}}, attempt) == 'persist'
    attempt.response = {'data': None}
    assert recovery_mode({'adapter': 'openai_image', 'config': {}}, attempt) == 'manual'


def test_manual_review_does_not_permanently_exhaust_channel_capacity(env):
    client, factory, ids = env
    with factory() as db:
        db.get(Channel, ids['channel']).concurrency = 1
        db.commit()
    first, _ = submit(client, ids, key='first-unknown-request')
    execute_mock(lambda request: httpx.Response(524, json={'cloudflare_error': True, 'error_code': 524}))
    second, _ = submit(client, ids, key='second-separate-request')
    claimed = worker.claim()
    assert claimed and claimed[0] == second['id']
    with factory() as db:
        assert db.get(Task, first['id']).status == 'reconciling'
        assert len(list(db.scalars(select(Attempt).where(Attempt.task_id == first['id'])))) == 1
