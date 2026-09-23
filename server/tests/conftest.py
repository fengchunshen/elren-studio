import os
import time
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.db import Base, get_db
from app.main import app
from app.config import settings
from app.models import User, Project, Channel, Offering, Price
from app.security import passwords
from app import worker


@pytest.fixture
def env(tmp_path, monkeypatch):
    url = os.getenv("ELREN_TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    if os.getenv("ELREN_TEST_DATABASE_URL"):
        assert url.rsplit('/', 1)[-1] == 'elren_test', 'Use only the isolated elren_test database'
    engine = create_engine(url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(worker, 'Session', factory)
    monkeypatch.setattr(settings, 'public_origin', 'http://testserver')
    monkeypatch.setattr(settings, 'cookie_secure', False)
    monkeypatch.setattr(settings, 'asset_dir', tmp_path / 'assets')
    monkeypatch.setenv('ELREN_PROVIDER_TEST', 'test-key-not-a-real-secret')
    monkeypatch.setattr('app.providers.validate_remote_url', lambda url, *args, **kwargs: url)
    def dependency():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = dependency
    with factory() as db:
        admin = User(username='admin',password_hash=passwords.hash('test-password-123'),role='admin',must_change_password=False)
        other = User(username='other',password_hash=passwords.hash('test-password-123'),role='user',must_change_password=False)
        db.add_all([admin,other]);db.flush()
        project = Project(user_id=admin.id,name='测试项目')
        other_project = Project(user_id=other.id,name='其他项目')
        channel = Channel(name='模拟渠道',base_url='https://provider.example',key_env='ELREN_PROVIDER_TEST',concurrency=2)
        db.add_all([project,other_project,channel]);db.flush()
        offering = Offering(name='测试文字',channel_id=channel.id,upstream_model='test-chat',operation='text.generate',adapter='openai_chat',parameters={'max_tokens':{'type':'integer','min':1,'max':1000,'default':100}},config={},active=True)
        db.add(offering);db.flush()
        components=[{'meter':'input_tokens','unit_size':'1000000','unit_price':'2'}, {'meter':'output_tokens','unit_size':'1000000','unit_price':'4'}, {'meter':'cache_read_tokens','unit_size':'1000000','unit_price':'0.2'}]
        for kind in ['cost','sale']:
            db.add(Price(offering_id=offering.id,kind=kind,currency='USD',display_currency='CNY',fx='7',markup='0.2' if kind=='sale' else '0',components=components,source='test only',published_at=time.time()))
        db.commit()
        ids={'admin':admin.id,'other':other.id,'project':project.id,'other_project':other_project.id,'offering':offering.id,'channel':channel.id}
    client=TestClient(app)
    response=client.post('/api/v1/auth/login',json={'username':'admin','password':'test-password-123'},headers={'Origin':'http://testserver'})
    assert response.status_code==200,response.text
    client.headers.update({'Origin':'http://testserver','X-CSRF-Token':response.json()['csrf_token']})
    yield client,factory,ids
    client.close();app.dependency_overrides.clear();engine.dispose()


def payload(ids, **changes):
    result={'project_id':ids['project'],'model_offering_id':ids['offering'],'operation':'text.generate','input':{'messages':[{'role':'user','content':'hello'}],'parameters':{'max_tokens':100}},'source':{}}
    result.update(changes)
    return result


def submit(client, ids, body=None, key='test-request-123'):
    body=body or payload(ids)
    quote=client.post('/api/v1/pricing/estimate',json=body)
    assert quote.status_code==200,quote.text
    body={**body,'input':quote.json()['input'],'quote_id':quote.json()['quote_id']}
    response=client.post('/api/v1/tasks',json=body,headers={'Idempotency-Key':key})
    assert response.status_code==202,response.text
    return response.json(),body

