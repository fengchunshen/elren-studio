import base64
import io
import json

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app.models import Channel, Offering, Price, Task
from app.assets import save_asset
from app.providers import normalized_usage
from app.pricing import calculate
from app.spacetime import spacetime_presets
from conftest import payload, submit
from test_platform import execute_mock


@pytest.mark.parametrize("preset_index", [0, 1, 2])
def test_spacetime_import_is_idempotent_and_hidden_until_configured(env, preset_index):
    client, factory, ids = env
    preset = spacetime_presets()[preset_index]
    path = '/api/v1/admin/model-presets/' + preset['id']
    first = client.post(path)
    assert first.status_code == 200, first.text
    model_id = first.json()['model_id']
    again = client.post(path).json()
    assert again == {'model_id': model_id, 'created': False}
    with factory() as db:
        model = db.get(Offering, model_id)
        channel = db.get(Channel, model.channel_id)
        assert model.upstream_model == preset['offering']['upstream_model']
        assert not model.active
        assert channel.base_url == 'https://spacetimeai.cc'
        assert channel.key_env == 'ELREN_PROVIDER_SPACETIMEAI'
        prices = list(db.scalars(select(Price).where(Price.offering_id == model_id)))
        assert {price.kind for price in prices} == ({'cost', 'sale'} if preset['reference_price'] else set())
        assert all(price.published_at is None for price in prices)
        assert all(price.markup == '0' for price in prices)
        assert all('按次(图片)' in price.source for price in prices)
    login = client.post('/api/v1/auth/login', json={'username': 'other', 'password': 'test-password-123'})
    client.headers['X-CSRF-Token'] = login.json()['csrf_token']
    catalog = client.get('/api/v1/models')
    assert catalog.status_code == 200
    assert model_id not in catalog.text


@pytest.mark.parametrize("preset_index", [0, 1, 2])
def test_spacetime_minimal_request_and_base64_asset_round_trip(env, preset_index):
    client, factory, ids = env
    offering = spacetime_presets()[preset_index]['offering']
    with factory() as db:
        model = db.get(Offering, ids['offering'])
        for key, value in offering.items():
            setattr(model, key, value)
        db.get(Channel, ids['channel']).base_url = 'https://spacetimeai.cc'
        # Isolated test price only: no upstream rate is inferred or published.
        for price in db.scalars(select(Price)):
            price.components = [{'meter': 'images', 'unit_size': '1', 'unit_price': '0.1'}]
        db.commit()
    body = payload(ids, operation='image.edit', input={'prompt': 'a white cup', 'parameters': {'size': '1.5K', 'ratio': '16:9'}})
    task, _ = submit(client, ids, body)
    output = io.BytesIO()
    Image.new('RGB', (1024, 1024), 'white').save(output, format='PNG')
    calls = []

    def handler(request):
        calls.append(str(request.url))
        assert request.method == 'POST'
        assert str(request.url) == 'https://spacetimeai.cc/v1/images/generations'
        assert request.headers['authorization'] == 'Bearer test-key-not-a-real-secret'
        assert json.loads(request.content) == {
            'model': offering['upstream_model'], 'prompt': 'a white cup',
            'size': '2048x1152', 'quality': 'auto', 'n': 1,
        }
        return httpx.Response(200, json={'data': [{'b64_json': base64.b64encode(output.getvalue()).decode()}]})

    execute_mock(handler)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'succeeded'
    with factory() as db:
        saved = db.get(Task, task['id'])
        assert saved.payload['input']['parameters']['size'] == '1.5K'
        assert saved.payload['input']['parameters']['ratio'] == '16:9'
    assert len(calls) == 1
    assert client.get(result['result']['assets'][0]['url']).content == output.getvalue()
    assert 'test-key-not-a-real-secret' not in json.dumps(result)
    # No usage evidence must remain unknown, not become zero token usage.
    assert normalized_usage(offering, {}) == ({}, {})
    invalid = client.post('/api/v1/pricing/estimate', json={
        **body, 'input': {'prompt': 'edit', 'asset_ids': ['unexpected-reference'] * 5, 'parameters': {}}})
    assert invalid.status_code == 400


def test_spacetime_reference_token_price_excludes_cached_input_and_preserves_unknown():
    from decimal import Decimal
    preset = spacetime_presets()[0]
    response = {'usage': {'input_tokens': 1000, 'output_tokens': 200,
                          'input_tokens_details': {'cached_tokens': 400}}}
    meters, raw = normalized_usage(preset['offering'], response)
    assert meters == {'input_tokens': '600', 'output_tokens': '200', 'cache_read_tokens': '400'}
    assert raw == response['usage']
    price = {**preset['reference_price'], 'markup': '0'}
    assert calculate(price, {**meters, 'images': '1'})['amount'] == Decimal('0.201')
    assert calculate(price, normalized_usage(preset['offering'], {})[0]) is None


@pytest.mark.parametrize('preset_index', [0, 1, 2])
def test_spacetime_reference_edit_keeps_image_bytes_and_public_characteristics(env, preset_index):
    import time
    client, factory, ids = env
    preset = spacetime_presets()[preset_index]
    model_id = client.post('/api/v1/admin/model-presets/' + preset['id']).json()['model_id']
    stream = io.BytesIO()
    Image.new('RGB', (32, 32), 'white').save(stream, format='PNG')
    with factory() as db:
        model = db.get(Offering, model_id)
        model.active = True
        channel = db.get(Channel, model.channel_id)
        channel.key_env = 'ELREN_PROVIDER_TEST'
        if not preset['reference_price']:
            for kind in ('cost', 'sale'):
                db.add(Price(offering_id=model_id, kind=kind, currency='CNY', fx='1', markup='0',
                             components=[{'meter': 'images', 'unit_size': '1', 'unit_price': '0.201'}],
                             source='isolated test fixture only', published_at=time.time()))
            db.flush()
        for price in db.scalars(select(Price).where(Price.offering_id == model_id)):
            price.published_at = time.time()
        asset = save_asset(db, ids['admin'], ids['project'], stream.getvalue(), 'image/png', 'cup.png')
        asset_id = asset.id
        db.commit()
    catalog = client.get('/api/v1/models').json()['items']
    public = next(item for item in catalog if item['id'] == model_id)
    assert public['tags'] == preset['offering']['config']['display_tags']
    assert public['description'] == preset['offering']['config']['display_description']
    assert not {'config', 'adapter', 'key_env', 'channel_id', 'upstream_model'} & public.keys()
    body = payload(ids, model_offering_id=model_id, operation='image.edit', input={
        'prompt': 'make the cup blue', 'asset_ids': [asset_id], 'parameters': {}})
    task, _ = submit(client, ids, body)
    def handler(request):
        assert request.url.path == '/v1/images/edits'
        assert request.headers['content-type'].startswith('multipart/form-data;')
        assert preset['offering']['upstream_model'].encode() in request.content
        assert b'name="image"' in request.content
        assert stream.getvalue() in request.content
        assert b'name="size"\r\n\r\n2048x2048' in request.content
        assert b'name="ratio"' not in request.content
        return httpx.Response(200, json={'data': [{'b64_json': base64.b64encode(stream.getvalue()).decode()}]})
    execute_mock(handler)
    result = client.get('/api/v1/tasks/' + task['id']).json()
    assert result['status'] == 'succeeded'
    assert result['billing']['status'] == 'recorded'
    assert float(result['billing']['amount']) == 0.201


def test_spacetime_mask_without_source_never_generates_text_only(env):
    from types import SimpleNamespace
    from app.providers import invoke, ProviderPreflightError
    _, factory, ids = env
    task = SimpleNamespace(offering_snapshot=spacetime_presets()[0]['offering'],
                           payload={'input': {'prompt': 'edit', 'mask_asset_id': 'mask', 'parameters': {}}})
    channel = SimpleNamespace(id=ids['channel'], base_url='https://spacetimeai.cc', key_env='ELREN_PROVIDER_TEST')
    with factory() as db, pytest.raises(ProviderPreflightError, match='蒙版编辑需要参考图片'):
        invoke(db, task, SimpleNamespace(id='attempt'), channel)
