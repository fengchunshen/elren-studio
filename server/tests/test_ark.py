import io
import json
import time
from decimal import Decimal

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app.ark import ark_presets, seedream_estimate
from app.models import Offering, Price, Task, Channel, User
from app.providers import normalized_usage
from app.pricing import calculate
from conftest import payload, submit
from test_platform import execute_mock


def configure(factory, ids, preset):
    with factory() as db:
        model = db.get(Offering, ids['offering'])
        for key, value in preset['offering'].items():
            setattr(model, key, value)
        for price in db.scalars(select(Price)):
            price.components = preset['reference_price']['components']
            price.currency, price.fx, price.markup = 'CNY', '1', '0'
        db.commit()


def image_bytes(size):
    stream = io.BytesIO()
    Image.new('RGB', size, 'white').save(stream, format='PNG')
    return stream.getvalue()


@pytest.mark.parametrize('requested_size,actual_size,amount', [
    ('1K', (1024, 1024), '0.30'),
    ('2K', (2048, 2048), '0.60'),
    ('2K', (2610, 1000), '0.30'),
    ('1K', (2611, 1000), '0.60'),
])
def test_seedream_text_image_actual_pixel_billing(env, requested_size, actual_size, amount):
    client, factory, ids = env
    preset = ark_presets()[0]
    configure(factory, ids, preset)
    task, _ = submit(client, ids, payload(ids, operation='image.edit', input={
        'prompt': 'a white teacup', 'parameters': {'size': requested_size}}))

    def handler(request):
        if request.method == 'POST':
            body = json.loads(request.content)
            assert request.url.path == '/api/v3/images/generations'
            assert 'image' not in body
            assert body['model'] == 'doubao-seedream-5-0-pro-260628'
            return httpx.Response(200, json={'data': [{'url': 'https://provider.example/image.png'}]})
        return httpx.Response(200, content=image_bytes(actual_size), headers={'Content-Type': 'image/png'})

    execute_mock(handler)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'succeeded'
    assert Decimal(result['billing']['amount']) == Decimal(amount)
    assert len(result['result']['assets']) == 1


def test_seedream_free_first_reference_and_missing_evidence():
    preset = ark_presets()[0]
    price = {**preset['reference_price'], 'markup': '0'}
    for count, amount in [(0, '0.60'), (1, '0.60'), (2, '0.62'), (10, '0.78')]:
        meters = seedream_estimate({'asset_ids': list(range(count)), 'parameters': {'size': '2K'}})
        assert calculate(price, meters)['amount'] == Decimal(amount)
    meters, _ = normalized_usage(preset['offering'], {})
    assert calculate(price, meters) is None


@pytest.mark.parametrize('preset_index', [1, 2])
@pytest.mark.parametrize('reference_count', [0, 1, 2])
def test_seedance_text_and_frames_polling_and_token_billing(env, preset_index, reference_count):
    client, factory, ids = env
    preset = ark_presets()[preset_index]
    configure(factory, ids, preset)
    asset_ids = []
    for index in range(reference_count):
        response = client.post('/api/v1/assets', data={'project_id': ids['project']},
                               files={'file': (f'frame{index}.png', image_bytes((300, 300)), 'image/png')})
        assert response.status_code == 200, response.text
        asset_ids.append(response.json()['id'])
    task, _ = submit(client, ids, payload(ids, operation='video.generate', input={
        'prompt': 'slow camera motion', 'parameters': {}, 'asset_ids': asset_ids}))

    def accepted(request):
        body = json.loads(request.content)
        assert request.url.path == '/api/v3/contents/generations/tasks'
        assert body['model'] == preset['offering']['upstream_model']
        assert body['duration'] == 5 and body['resolution'] == '720p'
        assert body['generate_audio'] is True
        if reference_count:
            assert 'ratio' not in body
        else:
            assert body['ratio'] == '16:9'
        assert [item['role'] for item in body['content'][1:]] == ['first_frame', 'last_frame'][:reference_count]
        assert all(item['image_url']['url'].startswith('data:image/png;base64,') for item in body['content'][1:])
        return httpx.Response(200, json={'id': 'ark-test-task'})

    execute_mock(accepted)
    with factory() as db:
        db.get(Task, task['id']).next_at = 0
        db.commit()

    def completed(request):
        if request.url.path == '/video.mp4':
            return httpx.Response(200, content=b'video-fixture', headers={'Content-Type': 'video/mp4'})
        assert request.url.path == '/api/v3/contents/generations/tasks/ark-test-task'
        return httpx.Response(200, json={'status': 'succeeded', 'duration': 5,
            'content': {'video_url': 'https://provider.example/video.mp4'}, 'usage': {'completion_tokens': 108000}})

    execute_mock(completed)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'succeeded'
    rate = Decimal(preset['reference_price']['components'][0]['unit_price'])
    assert Decimal(result['billing']['amount']) == Decimal('0.108') * rate
    assert len(result['result']['assets']) == 1


def test_ark_presets_share_one_channel_and_key(env):
    client, factory, ids = env
    imported = [client.post('/api/v1/admin/model-presets/' + preset['id']).json()['model_id'] for preset in ark_presets()]
    with factory() as db:
        channels = {db.get(Offering, model_id).channel_id for model_id in imported}
        assert len(channels) == 1
        assert db.get(Channel, channels.pop()).key_env == 'ELREN_PROVIDER_ARK'
        assert all(not db.get(Offering, model_id).active for model_id in imported)


def test_approved_setup_idempotency_and_promotion_expiry(env, monkeypatch):
    from app.ark_setup import configure_ark, MINI_PROMOTION_END
    from app.pricing import current_price
    client, factory, ids = env
    monkeypatch.setattr('time.time', lambda: MINI_PROMOTION_END - 100)
    with factory() as db:
        actor = db.get(User, ids['admin'])
        created = configure_ark(db, actor)
        assert len(created) == 3 and all(item['created'] for item in created)
        assert all(not item['created'] for item in configure_ark(db, actor))
        mini = next(item for item in created if 'Mini' in item['name'])
        assert current_price(db, mini['id'], 'cost').components[0]['unit_price'] == '9.2'
        assert current_price(db, mini['id'], 'sale').markup == '0'
        monkeypatch.setattr('time.time', lambda: MINI_PROMOTION_END + 1)
        assert current_price(db, mini['id'], 'cost').components[0]['unit_price'] == '23'
        assert current_price(db, mini['id'], 'sale').components[0]['unit_price'] == '23'
        assert len(list(db.scalars(select(Price).where(Price.offering_id == mini['id'])))) == 4


def test_worker_credentials_are_literal_and_provider_scoped(tmp_path, monkeypatch):
    from app.provider_environment import load_provider_environment
    import os
    path = tmp_path / '.env.providers'
    monkeypatch.setenv('ELREN_PROVIDER_ARK', 'previous-test-value')
    monkeypatch.setenv('DATABASE_URL', 'unchanged')
    path.write_text("ELREN_PROVIDER_ARK='literal-$(do-not-execute)'\nDATABASE_URL=ignored\n")
    load_provider_environment(path)
    assert os.environ['ELREN_PROVIDER_ARK'] == 'literal-$(do-not-execute)'
    assert os.environ['DATABASE_URL'] == 'unchanged'


def test_local_dns_rejection_never_submits_or_leaves_ambiguous_task(env, monkeypatch):
    client, factory, ids = env
    configure(factory, ids, ark_presets()[0])
    task, _ = submit(client, ids, payload(ids, operation='image.edit', input={'prompt': 'test', 'parameters': {}}))
    def reject(url):
        raise ValueError('禁止访问内部网络地址')
    monkeypatch.setattr('app.providers.validate_remote_url', reject)
    def unexpected_http(request):
        pytest.fail('Preflight rejection must not send HTTP')
    execute_mock(unexpected_http)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'failed'
    assert result['billing']['status'] == 'not_billable'
    with factory() as db:
        assert db.get(Task, task['id']).cost_status == 'not_incurred'


@pytest.mark.parametrize('tier,ratio,outgoing,amount', [
    ('1K', 'auto', '1K', '0.30'),
    ('1.5K', '16:9', '2048x1152', '0.30'),
    ('2K', '9:16', '1584x2816', '0.60'),
    ('1K', '5:4', '1120x896', '0.30'),
])
def test_seedream_specs_quote_and_provider_request_agree(env, tier, ratio, outgoing, amount):
    client, factory, ids = env
    configure(factory, ids, ark_presets()[0])
    body = payload(ids, operation='image.edit', input={'prompt': 'a teapot', 'parameters': {'size': tier, 'ratio': ratio}})
    estimate = client.post('/api/v1/pricing/estimate', json=body)
    assert estimate.status_code == 200, estimate.text
    assert Decimal(estimate.json()['amount']) == Decimal(amount)
    task, saved = submit(client, ids, body)
    assert saved['input']['parameters'] == {'size': tier, 'ratio': ratio}
    actual = (1024, 1024) if outgoing == '1K' else tuple(map(int, outgoing.split('x')))
    def provider(request):
        if request.method == 'POST':
            sent = json.loads(request.content)
            assert sent['size'] == outgoing
            assert 'ratio' not in sent
            assert sent['watermark'] is True
            return httpx.Response(200, json={'data': [{'url': 'https://provider.example/image.png', 'size': outgoing}]})
        return httpx.Response(200, content=image_bytes(actual), headers={'Content-Type': 'image/png'})
    execute_mock(provider)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'succeeded'
    assert Decimal(result['billing']['amount']) == Decimal(amount)
    with factory() as db:
        assert db.get(Task, task['id']).payload['input']['parameters'] == {'size': tier, 'ratio': ratio}


def test_seedream_spec_mapping_stays_inside_provider_limits():
    from app.ark import SEEDREAM_SIZES, SEEDREAM_RATIOS, seedream_size
    for tier in SEEDREAM_SIZES:
        for ratio in SEEDREAM_RATIOS[1:]:
            w, h = map(int, seedream_size({'size': tier, 'ratio': ratio}).split('x'))
            assert 921600 <= w * h <= 4624220
            assert 1 / 16 <= w / h <= 16
    with pytest.raises(ValueError):
        seedream_size({'size': '4K'})
    with pytest.raises(ValueError):
        seedream_size({'ratio': '100:1'})


def test_seedream_specs_reject_unavailable_values_before_quote(env):
    client, factory, ids = env
    configure(factory, ids, ark_presets()[0])
    for parameters in [{'size': '4K'}, {'ratio': '100:1'}, {'size': '512x512'}, {'ratio': 1}]:
        result = client.post('/api/v1/pricing/estimate', json=payload(ids, operation='image.edit', input={'prompt': 'test', 'parameters': parameters}))
        assert result.status_code == 400


def test_seedream_upgrade_is_scoped_idempotent_and_preserves_prices(env):
    from app.models import User, Audit
    from app.ark_setup import configure_ark, upgrade_seedream_specs
    client, factory, ids = env
    with factory() as db:
        actor = db.get(User, ids['admin'])
        configured = configure_ark(db, actor)
        image_id = next(item['id'] for item in configured if item['name'] == 'Seedream 5.0 Pro')
        image = db.get(Offering, image_id)
        image.parameters = {'size': {'type': 'string', 'enum': ['1K', '2K'], 'default': '1K'}, 'watermark': {'type': 'boolean', 'default': True}}
        db.commit()
        prices = [(p.id, p.components, p.published_at) for p in db.scalars(select(Price))]
        before = dict(image.parameters)
        assert upgrade_seedream_specs(db, actor, dry_run=True)[0]['changed']
        assert image.parameters == before
        assert upgrade_seedream_specs(db, actor)[0]['changed']
        assert image.parameters['size']['default'] == '1K'
        assert image.parameters['size']['enum'] == ['1K', '1.5K', '2K']
        assert image.parameters['ratio']['default'] == 'auto'
        assert image.parameters['watermark']['default'] is True
        assert not upgrade_seedream_specs(db, actor)[0]['changed']
        assert [(p.id, p.components, p.published_at) for p in db.scalars(select(Price))] == prices
        assert len(list(db.scalars(select(Audit).where(Audit.action == 'seedream.specs.upgrade')))) == 1
