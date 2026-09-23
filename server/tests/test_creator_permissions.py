import pytest


@pytest.mark.parametrize('path',[
    '/admin/models','/admin/channels','/admin/model-presets','/admin/price-versions',
    '/admin/users','/admin/usage/records','/admin/usage/summary','/admin/audit-events',
])
def test_creator_cannot_read_admin_resources(env,path):
    client,_,_=env
    result=client.post('/api/v1/auth/login',json={'username':'other','password':'test-password-123'}).json()
    client.headers['X-CSRF-Token']=result['csrf_token']
    assert client.get('/api/v1'+path).status_code==403


def test_creator_cannot_import_presets_or_see_provider_configuration(env):
    client,_,_=env
    result=client.post('/api/v1/auth/login',json={'username':'other','password':'test-password-123'}).json()
    client.headers['X-CSRF-Token']=result['csrf_token']
    assert client.post('/api/v1/admin/model-presets/seedream-5-pro').status_code==403
    result=client.get('/api/v1/models')
    assert result.status_code==200
    for model in result.json()['items']:
        assert not {'config','adapter','key_env','base_url','upstream_model','channel_id'} & model.keys()
