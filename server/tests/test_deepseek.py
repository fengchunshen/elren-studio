import json

import httpx
import pytest

from app.deepseek import deepseek_presets
from app.providers import normalized_usage
from conftest import payload, submit
from test_ark import configure
from test_platform import execute_mock


@pytest.mark.parametrize('nested_cache', [False, True])
def test_flash_text_request_and_cache_accounting(env, nested_cache):
    client, factory, ids = env
    configure(factory, ids, deepseek_presets()[0])
    task, _ = submit(client, ids, payload(ids, input={
        'messages': [{'role': 'user', 'content': '写一句开场白'}], 'parameters': {}}))
    usage = {'prompt_tokens': 100, 'completion_tokens': 20, 'prompt_cache_hit_tokens': 80,
             'prompt_cache_miss_tokens': 20}
    if nested_cache:
        usage['prompt_tokens_details'] = {'cached_tokens': 80}

    def handler(request):
        body = json.loads(request.content)
        assert request.url.path == '/chat/completions'
        assert body['model'] == 'deepseek-flash'
        assert body['reasoning_effort'] == 'none'
        assert body['max_tokens'] == 4096
        assert body['stream'] is False
        return httpx.Response(200, json={'id': 'test-flash', 'created': 1790038800, 'choices': [
            {'message': {'content': '今天，让故事从这里开始。'}, 'finish_reason': 'stop'}], 'usage': usage})

    execute_mock(handler)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'succeeded'
    assert result['result']['text'] == '今天，让故事从这里开始。'
    assert result['billing']['status'] == 'recorded'
    meters, _ = normalized_usage(deepseek_presets()[0]['offering'], {'usage': usage})
    assert meters == {'input_tokens': '20', 'cache_read_tokens': '80', 'output_tokens': '20'}


def test_flash_import_is_idempotent_and_not_published(env):
    client, _, _ = env
    first = client.post('/api/v1/admin/model-presets/deepseek-flash')
    assert first.status_code == 200, first.text
    second = client.post('/api/v1/admin/model-presets/deepseek-flash')
    assert second.status_code == 200, second.text
    assert first.json()['model_id'] == second.json()['model_id']
    assert first.json()['prices_published'] is False
    assert second.json()['created'] is False


def timestamp(local):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.fromisoformat(local).replace(tzinfo=ZoneInfo('Asia/Shanghai')).timestamp()


@pytest.mark.parametrize('local,period', [
    ('2026-09-21T08:59:59', 'off_peak'), ('2026-09-21T09:00:00', 'peak'),
    ('2026-09-21T11:59:59', 'peak'), ('2026-09-21T12:00:00', 'off_peak'),
    ('2026-09-21T13:59:59', 'off_peak'), ('2026-09-21T14:00:00', 'peak'),
    ('2026-09-21T17:59:59', 'peak'), ('2026-09-21T18:00:00', 'off_peak'),
    ('2026-09-26T10:00:00', 'off_peak'), ('2026-09-27T15:00:00', 'off_peak'),
])
def test_official_peak_boundaries_and_exact_prices(local, period):
    from decimal import Decimal
    from app.pricing import calculate, validate_price, deepseek_period
    price = {**deepseek_presets()[0]['reference_price'], 'markup': '0', 'display_currency': 'CNY', 'kind': 'sale'}
    validate_price(price)
    at = timestamp(local)
    assert deepseek_period(at) == period
    result = calculate(price, {'input_tokens': '1000000', 'cache_read_tokens': '1000000', 'output_tokens': '1000000'}, billing_at=at)
    assert result['amount'] == Decimal('10.04' if period == 'peak' else '5.02')
    assert all(item['period'] == period and item['billing_at'] == at for item in result['items'])


@pytest.mark.parametrize('created', [None, 'bad', True, -1, float('nan')])
def test_missing_or_invalid_provider_time_does_not_guess_price(created):
    from app.pricing import calculate
    price = {**deepseek_presets()[0]['reference_price'], 'markup': '0'}
    assert calculate(price, {'input_tokens': '1', 'cache_read_tokens': '0', 'output_tokens': '1'}, billing_at=created) is None


def test_response_time_drives_both_prices_and_replay_does_not_duplicate(env):
    from sqlalchemy import select
    from app.models import Entry, Attempt, Task
    from app.services import record_usage
    from decimal import Decimal
    client, factory, ids = env
    configure(factory, ids, deepseek_presets()[0])
    task, _ = submit(client, ids)
    response = {'id': 'test-tariff', 'created': timestamp('2026-09-26T10:00:00'),
                'choices': [{'message': {'content': 'ok'}}],
                'usage': {'prompt_tokens': 100, 'prompt_cache_hit_tokens': 80, 'completion_tokens': 20}}
    execute_mock(lambda request: httpx.Response(200, json=response))
    with factory() as db:
        saved = db.get(Task, task['id'])
        attempt = db.scalar(select(Attempt).where(Attempt.task_id == saved.id))
        meters, raw = normalized_usage(saved.offering_snapshot, response)
        record_usage(db, saved, attempt, meters, raw); db.commit()
        entries = list(db.scalars(select(Entry).where(Entry.task_id == saved.id)))
        assert len(entries) == 2
        assert {e.kind for e in entries} == {'sale', 'cost'}
        assert all(e.amount == Decimal('0.0001016') for e in entries)
        assert all(e.details['items'][0]['period'] == 'off_peak' for e in entries)


def test_publishing_preserves_history_and_is_idempotent(env):
    from sqlalchemy import select
    from app.models import Channel, Offering, Price, User
    from app.deepseek_setup import configure_deepseek_prices
    _, factory, ids = env
    with factory() as db:
        model = db.get(Offering, ids['offering'])
        for key, value in deepseek_presets()[0]['offering'].items():
            setattr(model, key, value)
        model.active = False
        db.get(Channel, ids['channel']).base_url = 'https://api.deepseek.com'
        db.commit()
        old = {p.id: json.dumps(p.components) for p in db.scalars(select(Price))}
        actor = db.get(User, ids['admin'])
        result = configure_deepseek_prices(db, actor)
        assert result['active'] and all(p['changed'] for p in result['prices'])
        assert all(json.dumps(db.get(Price, identity).components) == value for identity, value in old.items())
        again = configure_deepseek_prices(db, actor)
        assert not any(p['changed'] for p in again['prices'])
        assert len(list(db.scalars(select(Price)))) == 4
