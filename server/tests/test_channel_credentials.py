import json
import stat
import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from app.models import Channel, ChannelCredential, Audit
from app.channel_credentials import resolve_channel_secret, save_channel_secret
from app.channel_probe import probe_channel
from app.config import settings
from conftest import payload, submit
from test_platform import execute_mock

KEY = 'sk-test-channel-secret-only'


def channel_body(**changes):
    return {'name': '测试渠道', 'base_url': 'https://provider.example', **changes}


def test_create_update_masked_read_and_worker_uses_latest_key(env):
    client, factory, ids = env
    response = client.post('/api/v1/admin/channels', json=channel_body(api_key=KEY))
    assert response.status_code == 200, response.text
    created = response.json()
    assert created['credential_configured'] and created['credential_source'] == 'saved'
    assert KEY not in response.text and 'ciphertext' not in response.text
    key_file = settings.asset_dir.parent / 'secrets/channel.key'
    assert stat.S_IMODE(key_file.stat().st_mode) == 0o600
    with factory() as db:
        stored = db.get(ChannelCredential, created['id'])
        assert KEY not in stored.ciphertext
        assert resolve_channel_secret(db, db.get(Channel, created['id'])) == KEY
        assert KEY not in str([entry.details for entry in db.scalars(select(Audit))])
    assert KEY not in client.get('/api/v1/admin/channels').text
    for blank in (None, '', '   '):
        response = client.patch('/api/v1/admin/channels/' + created['id'], json=channel_body(api_key=blank, active=False))
        assert response.status_code == 200
        with factory() as db:
            assert resolve_channel_secret(db, db.get(Channel, created['id'])) == KEY
    # Existing worker environment must be overridden without restarting.
    response = client.patch('/api/v1/admin/channels/' + ids['channel'], json=channel_body(api_key=KEY))
    assert response.status_code == 200
    submit(client, ids)
    def handler(request):
        assert request.headers['Authorization'] == 'Bearer ' + KEY
        return httpx.Response(200, json={'choices': [{'message': {'content': 'ok'}}],
                                       'usage': {'prompt_tokens': 1, 'completion_tokens': 1}})
    execute_mock(handler)
    rotated = KEY + '-rotated'
    response = client.patch('/api/v1/admin/channels/' + ids['channel'], json=channel_body(api_key=rotated))
    assert response.status_code == 200  # Rotation allowed even with past tasks.
    with factory() as db:
        assert resolve_channel_secret(db, db.get(Channel, ids['channel'])) == rotated


def test_secret_is_never_returned_by_validation_or_audit(env):
    client, _, _ = env
    for body in [channel_body(api_key={'secret': KEY}), channel_body(api_key=KEY, unexpected=KEY),
                 channel_body(api_key=KEY + '\ninvalid'), channel_body(api_key='********')]:
        response = client.post('/api/v1/admin/channels', json=body)
        assert response.status_code in (400, 422)
        assert KEY not in response.text
    assert KEY not in client.get('/api/v1/admin/audit-events').text


def test_test_does_not_save_and_cannot_send_saved_key_to_new_address(env, monkeypatch):
    client, factory, ids = env
    calls = []
    monkeypatch.setattr('app.main.probe_channel', lambda url, key: calls.append((url, key)) or {'ok': True, 'message': '测试成功'})
    body = {'channel_id': ids['channel'], 'base_url': 'https://provider.example', 'api_key': KEY}
    assert client.post('/api/v1/admin/channels/test', json=body).json()['ok']
    with factory() as db:
        assert db.get(ChannelCredential, ids['channel']) is None
    assert calls == [('https://provider.example', KEY)]
    calls.clear()
    body.pop('api_key'); body['base_url'] = 'https://different.example'
    assert client.post('/api/v1/admin/channels/test', json=body).status_code == 400
    assert not calls
    response = client.patch('/api/v1/admin/channels/' + ids['channel'], json=channel_body(base_url=body['base_url']))
    assert response.status_code == 400


def test_legacy_key_supported_and_missing_encryption_key_fails_closed(env):
    client, factory, ids = env
    with factory() as db:
        channel = db.get(Channel, ids['channel'])
        assert resolve_channel_secret(db, channel) == 'test-key-not-a-real-secret'
        save_channel_secret(db, channel, KEY); db.commit()
    key_file = settings.asset_dir.parent / 'secrets/channel.key'
    key_file.unlink()
    with factory() as db:
        with pytest.raises(ValueError, match='无法解密'):
            resolve_channel_secret(db, db.get(Channel, ids['channel']))
    assert not key_file.exists()


def test_ordinary_user_and_csrf_cannot_manage_or_probe_credentials(env):
    client, _, _ = env
    assert client.post('/api/v1/admin/channels/test', json={'base_url': 'https://provider.example'},
                       headers={'X-CSRF-Token': 'wrong'}).status_code == 403
    response = client.post('/api/v1/auth/login', json={'username': 'other', 'password': 'test-password-123'})
    client.headers['X-CSRF-Token'] = response.json()['csrf_token']
    for method, path, body in [('GET', '/api/v1/admin/channels', None),
                               ('POST', '/api/v1/admin/channels', channel_body(api_key=KEY)),
                               ('POST', '/api/v1/admin/channels/test', {'base_url': 'https://provider.example', 'api_key': KEY})]:
        assert client.request(method, path, json=body).status_code == 403


@pytest.mark.parametrize('status,data,ok', [(200, {'data': []}, True), (200, {'html': KEY}, False),
    (401, {'error': KEY}, False), (403, {}, False), (429, {}, False), (404, {}, False), (302, {}, False), (500, {}, False)])
def test_probe_is_read_only_and_does_not_echo_provider_body(monkeypatch, status, data, ok):
    monkeypatch.setattr('app.channel_probe.validate_remote_url', lambda url: url)
    original = httpx.Client
    def handler(request):
        assert request.method == 'GET' and request.url.path == '/models'
        assert request.headers['Authorization'] == 'Bearer ' + KEY
        return httpx.Response(status, json=data, headers={'location': 'https://different.example'})
    monkeypatch.setattr('app.channel_probe.httpx.Client', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    result = probe_channel('https://api.deepseek.com', KEY)
    assert result['ok'] == ok and KEY not in json.dumps(result)


def test_probe_rejects_private_destination_without_sending_key(monkeypatch):
    def reject(url):
        raise ValueError('private address')
    monkeypatch.setattr('app.channel_probe.validate_remote_url', reject)
    monkeypatch.setattr('app.channel_probe.httpx.Client', lambda **kw: pytest.fail('must not connect'))
    assert not probe_channel('https://127.0.0.1', KEY)['ok']
