import httpx
import pytest
from sqlalchemy import select

from app.models import Attempt, Entry, Task
from app.provider_errors import provider_failure_message
from app import worker
from conftest import payload, submit
from test_ark import configure
from app.ark import ark_presets
from test_platform import execute_mock


COPYRIGHT_RESPONSE = {"error": {
    "code": "OutputImageSensitiveContentDetected.PolicyViolation",
    "message": "The request failed because the output image may be related to copyright restrictions. Request id: test-request",
    "type": "BadRequest",
}}
COPYRIGHT_MESSAGE = "生成结果可能涉及版权限制，未通过审核。请调整创作内容后重试。"
PRIVACY_RESPONSE = {"error": {
    "code": "InputImageSensitiveContentDetected.PrivacyInformation",
    "message": "The request failed because the input image 'content[1]' may contain real person. Request id: private-request-id",
    "type": "BadRequest",
}}
PRIVACY_MESSAGE = "参考图被判定可能包含真人，未通过人像隐私审核。请使用符合该模型要求的参考素材。"


@pytest.mark.parametrize('async_failure', [False, True])
def test_content_rejection_preserves_evidence_and_does_not_retry_or_bill(env, async_failure):
    client, factory, ids = env
    configure(factory, ids, ark_presets()[0])
    task, _ = submit(client, ids, payload(ids, operation='image.edit', input={'prompt': 'test', 'parameters': {}}))
    response = {**COPYRIGHT_RESPONSE, **({'status': 'failed'} if async_failure else {})}
    execute_mock(lambda request: httpx.Response(200 if async_failure else 400, json=response))
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'failed'
    assert result['error'] == COPYRIGHT_MESSAGE
    assert result['billing']['status'] == 'not_billable'
    assert result['result'] == {}
    with factory() as db:
        attempt = db.scalar(select(Attempt).where(Attempt.task_id == task['id']))
        assert attempt.response == response
        assert db.get(Task, task['id']).error == COPYRIGHT_MESSAGE
        assert list(db.scalars(select(Entry).where(Entry.kind == 'sale'))) == []
    assert worker.claim() is None


def test_legacy_failure_is_translated_on_read_without_rewriting_evidence(env):
    client, factory, ids = env
    task, _ = submit(client, ids)
    execute_mock(lambda request: httpx.Response(400, json=COPYRIGHT_RESPONSE))
    with factory() as db:
        db.get(Task, task['id']).error = '上游请求失败（HTTP 400）'
        db.commit()
    assert client.get('/api/v1/tasks/' + task['id']).json()['error'] == COPYRIGHT_MESSAGE
    assert client.get('/api/v1/tasks').json()['items'][0]['error'] == COPYRIGHT_MESSAGE
    with factory() as db:
        assert db.get(Task, task['id']).error == '上游请求失败（HTTP 400）'
        assert db.scalar(select(Attempt)).response == COPYRIGHT_RESPONSE


@pytest.mark.parametrize('response', [None, {}, {'error': 'raw error'}, {'error': {'code': []}},
    {'error': {'code': 'UnknownError', 'message': 'secret-key https://private.example/?token=secret'}}])
def test_unknown_errors_do_not_expose_raw_provider_content(response):
    assert provider_failure_message(response, '上游请求失败（HTTP 400）') == '上游请求失败（HTTP 400）'


def test_content_rejection_without_copyright_evidence_does_not_guess_copyright():
    assert provider_failure_message({'error': {'code': 'OutputImageSensitiveContentDetected',
        'message': 'Content blocked'}}, 'fallback') == '生成结果未通过内容审核，请调整创作内容后重试。'


def test_seedance_input_privacy_rejection_and_legacy_read_preserve_evidence(env):
    client, factory, ids = env
    configure(factory, ids, ark_presets()[1])
    task, _ = submit(client, ids, payload(ids, operation='video.generate', input={'prompt': 'test', 'parameters': {}}))
    execute_mock(lambda request: httpx.Response(400, json=PRIVACY_RESPONSE))
    current = client.get('/api/v1/tasks/' + task['id']).json()
    assert current['status'] == 'failed'
    assert current['error'] == PRIVACY_MESSAGE
    assert current['billing']['status'] == 'not_billable'
    assert 'private-request-id' not in str(current)
    with factory() as db:
        db.get(Task, task['id']).error = '上游请求失败（HTTP 400）'
        db.commit()
    assert client.get('/api/v1/tasks/' + task['id']).json()['error'] == PRIVACY_MESSAGE
    assert worker.claim() is None
    with factory() as db:
        assert db.scalar(select(Attempt).where(Attempt.task_id == task['id'])).response == PRIVACY_RESPONSE
        assert not list(db.scalars(select(Entry).where(Entry.task_id == task['id'], Entry.kind == 'sale')))


def test_input_moderation_does_not_guess_real_person_for_other_codes():
    response = {'error': {'code': 'InputImageSensitiveContentDetected.PolicyViolation', 'message': 'blocked'}}
    assert provider_failure_message(response, 'fallback') == '参考图未通过内容审核，请使用符合该模型要求的参考素材。'
