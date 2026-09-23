import shutil
import subprocess
import time
import pytest
from app.assets import save_asset
from app.models import MediaJob
from app.media_processing import validate_clips, claim_media_job, execute_media_job, probe, scene_boundaries
from app.config import settings


def test_media_job_ownership_and_request_identity(env):
    client, factory, ids = env
    with factory() as db:
        asset = save_asset(db, ids['admin'], ids['project'], b'video fixture', 'video/mp4', 'test.mp4')
        db.commit(); identity = asset.id
    body = {'project_id': ids['project'], 'clips': [{'asset_id': identity, 'start': 0, 'end': 1}]}
    response = client.post('/api/v1/media-jobs', json=body, headers={'Idempotency-Key': 'same-render'})
    assert response.status_code == 200, response.text
    again = client.post('/api/v1/media-jobs', json=body, headers={'Idempotency-Key': 'same-render'})
    assert again.json()['id'] == response.json()['id']
    changed = {**body, 'clips': [{'asset_id': identity, 'start': 0, 'end': 2}]}
    assert client.post('/api/v1/media-jobs', json=changed, headers={'Idempotency-Key': 'same-render'}).status_code == 400
    with factory() as db:
        with pytest.raises(ValueError, match='当前项目'):
            validate_clips(db, ids['other'], ids['other_project'], body['clips'], 1280, 720)
    canceled = client.post(f"/api/v1/media-jobs/{response.json()['id']}/cancel")
    assert canceled.json()['status'] == 'canceled'
    assert claim_media_job(factory) is None


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg required for media integration')
def test_renders_real_clips_with_silent_audio_track_and_recovers_expired_job(env, tmp_path):
    client, factory, ids = env
    source = tmp_path / 'fixture.mp4'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30', '-t', '2', '-pix_fmt', 'yuv420p', '-y', str(source)], check=True, capture_output=True)
    with factory() as db:
        asset = save_asset(db, ids['admin'], ids['project'], source.read_bytes(), 'video/mp4', 'fixture.mp4')
        db.commit()
        payload = validate_clips(db, ids['admin'], ids['project'], [{'asset_id': asset.id, 'start': 0, 'end': 0.5}, {'asset_id': asset.id, 'start': 1, 'end': 2}], 1280, 720)
        job = MediaJob(user_id=ids['admin'], project_id=ids['project'], payload=payload, status='running', request_key='real-render', lease_until=time.time() - 1)
        db.add(job); db.commit(); identity = job.id
    claimed = claim_media_job(factory)
    assert claimed[0] == identity
    execute_media_job(factory, *claimed)
    response = client.get(f'/api/v1/media-jobs/{identity}').json()
    assert response['status'] == 'succeeded', response
    output = client.get(response['result']['asset']['url'])
    assert output.status_code == 200
    path = tmp_path / 'result.mp4'; path.write_bytes(output.content)
    metadata = probe(path)
    assert 1.4 < float(metadata['format']['duration']) < 1.8
    assert {stream['codec_type'] for stream in metadata['streams']} == {'video', 'audio'}
    video = next(stream for stream in metadata['streams'] if stream['codec_type'] == 'video')
    assert (video['width'], video['height']) == (1280, 720)


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg required for scene detection')
def test_detects_real_scene_transition(tmp_path):
    source = tmp_path / 'two-scenes.mp4'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', '-y', str(source)], check=True, capture_output=True)
    spans = scene_boundaries(source, 0, 4)
    assert len(spans) == 2
    assert spans[0][0] == 0 and 1.9 < spans[0][1] < 2.1
    assert spans[1][0] == spans[0][1] and spans[1][1] == 4
