import copy
import json
from types import SimpleNamespace
import httpx
import pytest
from app.video_edit import validate_video_edit
from app.services import validate_offering
from app.providers import invoke


def target_spec():
    return {'version': 1, 'source_duration': 8, 'target': {'time': 2, 'box': {'x': .1, 'y': .2, 'width': .3, 'height': .4}}}


def refs():
    return [{'asset_id': 'v', 'role': 'source'}, {'asset_id': 'f', 'role': 'target_frame'}, {'asset_id': 'r', 'role': 'replacement'}]


def test_target_contract_rejects_bad_regions_and_wrong_media():
    kinds = {'v': 'video', 'f': 'image', 'r': 'image'}
    validate_video_edit('video.replace', target_spec(), refs(), kinds)
    for change in [{'x': .9}, {'height': -1}, {'width': float('nan')}]:
        spec = target_spec(); spec['target']['box'].update(change)
        with pytest.raises(ValueError): validate_video_edit('video.replace', spec, refs(), kinds)
    with pytest.raises(ValueError): validate_video_edit('video.replace', target_spec(), refs(), {**kinds, 'v': 'image'})
    with pytest.raises(ValueError): validate_video_edit('video.replace', target_spec(), refs()[:2], kinds)


def test_retake_and_extension_validate_temporal_bounds():
    shot = {'start': 0, 'end': 3, 'camera': 'front', 'framing': 'wide', 'motion': 'push', 'prompt': '重新拍摄'}
    spec = {'version': 1, 'source_duration': 8, 'shots': [shot]}
    validate_video_edit('video.retake', spec, refs()[:1], {'v': 'video'})
    with pytest.raises(ValueError): validate_video_edit('video.retake', {**spec, 'shots': [shot, {**shot, 'start': 2}]}, refs()[:1], {'v': 'video'})
    extension = {'version': 1, 'source_duration': 8, 'extension': {'direction': 'before', 'duration': 3}}
    validate_video_edit('video.extend', extension, refs()[:1], {'v': 'video'})
    with pytest.raises(ValueError): validate_video_edit('video.extend', {**extension, 'extension': {'direction': 'before', 'duration': True}}, refs()[:1], {'v': 'video'})


def test_provider_mapping_must_explicitly_consume_editor_data(env):
    _, factory, _ = env
    offering = {'operation': 'video.extend', 'adapter': 'json_async', 'upstream_model': 'mock-edit', 'parameters': {}, 'config': {'video_edit_contract': 1, 'submit_path': '/edit', 'output_path': 'output', 'body': {'editing': '{{input.video_edit}}', 'prompt': '{{input.prompt}}'}}}
    validate_offering(offering)
    broken = copy.deepcopy(offering); broken['config']['body'] = {'prompt': '{{input.prompt}}'}
    with pytest.raises(ValueError, match='尚未映射'): validate_offering(broken)
    spec = {'version': 1, 'source_duration': 8, 'extension': {'direction': 'before', 'duration': 3}}
    task = SimpleNamespace(offering_snapshot=offering, payload={'input': {'prompt': '续写', 'video_edit': spec, 'asset_ids': []}})
    def handle(request):
        assert json.loads(request.content)['editing'] == spec
        return httpx.Response(200, json={'output': 'https://media.example/result.mp4'})
    with factory() as db, httpx.Client(transport=httpx.MockTransport(handle)) as client:
        assert invoke(db, task, SimpleNamespace(id='attempt', remote_id=None), SimpleNamespace(base_url='https://provider.example', key_env='ELREN_PROVIDER_TEST'), client=client)[0] == 200


def test_estimate_rejects_unwired_editor_and_foreign_source_before_task_creation(env):
    from app.models import Offering, Asset
    client, factory, ids = env
    with factory() as db:
        offering = db.get(Offering, ids['offering'])
        offering.operation = 'video.replace'; offering.adapter = 'json_async'
        offering.config = {'accepted_media': ['video', 'image'], 'max_assets': 3}
        for identity, mime in [('v', 'video/mp4'), ('f', 'image/png'), ('r', 'image/png')]:
            db.add(Asset(id=identity, user_id=ids['admin'], project_id=ids['project'], storage_key=identity, mime=mime, name=identity, size=1, sha256='0' * 64))
        db.commit()
    body = {'project_id': ids['project'], 'model_offering_id': ids['offering'], 'operation': 'video.replace', 'input': {'prompt': 'replace', 'asset_ids': ['v', 'f', 'r'], 'references': refs(), 'video_edit': target_spec(), 'parameters': {}}}
    assert client.post('/api/v1/pricing/estimate', json=body).status_code == 400
    with factory() as db:
        offering = db.get(Offering, ids['offering']); offering.config = {**offering.config, 'video_edit_contract': 1}; db.commit()
    response = client.post('/api/v1/pricing/estimate', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['input']['video_edit'] == target_spec()
    with factory() as db:
        source = db.get(Asset, 'v'); source.user_id = ids['other']; source.project_id = ids['other_project']; db.commit()
    assert client.post('/api/v1/pricing/estimate', json=body).status_code == 404
