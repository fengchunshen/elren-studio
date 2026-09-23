import base64
from types import SimpleNamespace
import httpx
from app.creative_presets import creative_presets
from app.providers import invoke, interpret, normalized_usage


def test_eleven_binary_audio_auth_and_billing_header(env):
    _, factory, _ = env
    offering = next(item for item in creative_presets() if item['id'] == 'eleven-v3-voice')['offering']
    task = SimpleNamespace(offering_snapshot=offering, payload={'input': {'prompt': '测试旁白', 'parameters': {'voice_id': 'voice-id', 'output_format': 'mp3_44100_128'}}})
    channel = SimpleNamespace(base_url='https://api.elevenlabs.io', key_env='ELREN_PROVIDER_TEST')
    attempt = SimpleNamespace(id='attempt', remote_id=None)
    def handler(request):
        assert request.url.path == '/v1/text-to-speech/voice-id'
        assert request.headers['xi-api-key'] == 'test-key-not-a-real-secret'
        assert 'authorization' not in request.headers
        assert request.url.params['output_format'] == 'mp3_44100_128'
        return httpx.Response(200, content=b'audio bytes', headers={'Content-Type': 'audio/mpeg', 'character-cost': '4'})
    with factory() as db, httpx.Client(transport=httpx.MockTransport(handler)) as client:
        code, data, _ = invoke(db, task, attempt, channel, client=client)
    assert code == 200
    assert base64.b64decode(data['output'].split(',')[1]) == b'audio bytes'
    assert interpret(offering, data)['state'] == 'succeeded'
    assert normalized_usage(offering, data)[0]['characters'] == '4'


def test_topaz_completed_status_fetches_authenticated_download_link(env):
    _, factory, _ = env
    offering = next(item for item in creative_presets() if item['id'] == 'topaz-standard-v2')['offering']
    task = SimpleNamespace(offering_snapshot=offering, payload={'input': {'prompt': 'enhance', 'parameters': {}}})
    channel = SimpleNamespace(base_url='https://api.topazlabs.com', key_env='ELREN_PROVIDER_TEST')
    attempt = SimpleNamespace(id='attempt', remote_id='job-id')
    requests = []
    def handler(request):
        requests.append(request.url.path)
        assert request.headers['X-API-Key'] == 'test-key-not-a-real-secret'
        return httpx.Response(200, json={'status': 'Completed'} if '/status/' in request.url.path else {'url': 'https://media.example/result.png'})
    with factory() as db, httpx.Client(transport=httpx.MockTransport(handler)) as client:
        _, data, _ = invoke(db, task, attempt, channel, polling=True, client=client)
    assert requests == ['/image/v1/status/job-id', '/image/v1/download/job-id']
    assert interpret(offering, data, True)['outputs'] == ['https://media.example/result.png']


def test_minimax_music_uses_milliseconds_and_does_not_treat_provider_rejection_as_pending():
    offering = next(item for item in creative_presets() if item['id'] == 'minimax-music-2-6')['offering']
    assert normalized_usage(offering, {'extra_info': {'music_duration': 25364}})[0]['audio_seconds'] == '25.364'
    assert interpret(offering, {'base_resp': {'status_code': 1004}})['state'] == 'failed'
