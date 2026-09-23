import base64
import io
import time
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import httpx
import pytest
from PIL import Image
from sqlalchemy import select, func
from app import worker
from app.models import Task, Attempt, Entry, Price, Offering, Quote
from app.pricing import calculate, validate_price
from app.providers import normalized_usage
from conftest import payload, submit


def chat_response(usage=True):
    result={'id':'request-1','choices':[{'message':{'content':'模拟回答'}}]}
    if usage:result['usage']={'prompt_tokens':1000,'completion_tokens':100,'prompt_tokens_details':{'cached_tokens':200}}
    return result


def execute_mock(handler):
    claimed=worker.claim()
    assert claimed is not None
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        worker.execute(*claimed,client=client)
    return claimed[0]


def test_decimal_pricing_cache_and_missing():
    model={'adapter':'openai_chat','config':{}}
    meters,_=normalized_usage(model,chat_response())
    assert meters=={'input_tokens':'800','output_tokens':'100','cache_read_tokens':'200'}
    price={'components':[{'meter':'input_tokens','unit_size':'1000000','unit_price':'2'},{'meter':'output_tokens','unit_size':'1000000','unit_price':'4'},{'meter':'cache_read_tokens','unit_size':'1000000','unit_price':'0.2'}],'markup':'0.2','fx':'7'}
    assert calculate(price,meters)['amount']==Decimal('0.017136')
    assert calculate(price,{'input_tokens':'800'}) is None
    with pytest.raises(ValueError):calculate(price,{'input_tokens':'NaN'})


def test_auth_and_ownership(env):
    client,db,ids=env
    assert client.get('/api/v1/projects').json()['items'][0]['id']==ids['project']
    assert client.patch('/api/v1/projects/'+ids['other_project'],json={'name':'stolen'}).status_code==404
    assert client.post('/api/v1/projects',json={'name':'bad'},headers={'X-CSRF-Token':'bad'}).status_code==403
    assert client.post('/api/v1/projects',json={'name':'bad'},headers={'Origin':'https://bad.example'}).status_code==403
    response=client.post('/api/v1/auth/login',json={'username':'other','password':'test-password-123'})
    client.headers['X-CSRF-Token']=response.json()['csrf_token']
    assert client.get('/api/v1/admin/users').status_code==403
    assert client.post('/api/v1/pricing/estimate',json=payload(ids)).status_code==404


def test_model_does_not_leak_cost_or_secret(env):
    client,_,_=env
    data=client.get('/api/v1/models').json()
    assert 'test-key' not in str(data) and 'key_env' not in str(data) and 'source' not in str(data)
    assert data['items'][0]['price']['components'][0]['unit_price']=='16.8'


def test_quote_tamper_and_locked_price(env):
    client,factory,ids=env
    body=payload(ids)
    quoted=client.post('/api/v1/pricing/estimate',json=body).json()
    with factory() as db:
        db.add(Price(offering_id=ids['offering'],kind='sale',currency='USD',display_currency='CNY',fx='7',markup='9',components=[{'meter':'input_tokens','unit_size':'1','unit_price':'99'}],source='new price',published_at=time.time()+0.001));db.commit()
    tampered={**body,'quote_id':quoted['quote_id'],'input':{'messages':[{'role':'user','content':'changed'}],'parameters':{'max_tokens':100}}}
    assert client.post('/api/v1/tasks',json=tampered,headers={'Idempotency-Key':'tampered-key'}).status_code==409
    response=client.post('/api/v1/tasks',json={**body,'quote_id':quoted['quote_id']},headers={'Idempotency-Key':'original-key'})
    assert response.status_code==202
    with factory() as db:
        assert db.get(Task,response.json()['id']).sale_snapshot['id']==quoted['price_version_id']


def test_task_execution_and_idempotent_ledger(env):
    client,factory,ids=env
    task,body=submit(client,ids)
    executed=execute_mock(lambda request:httpx.Response(200,json=chat_response(),headers={'x-request-id':'upstream-1'}))
    assert executed==task['id']
    result=client.get('/api/v1/tasks/'+executed).json()
    assert result['status']=='succeeded' and result['result']['text']=='模拟回答'
    assert Decimal(result['billing']['amount'])==Decimal('0.017136')
    with factory() as db:
        quote=db.get(Quote,body['quote_id']);quote.expires_at=0;db.commit()
    duplicate=client.post('/api/v1/tasks',json=body,headers={'Idempotency-Key':'test-request-123'})
    assert duplicate.status_code==202 and duplicate.json()['id']==executed
    assert worker.claim() is None
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Attempt))==1
        assert db.scalar(select(func.count()).select_from(Entry))==2
    total=client.get('/api/v1/usage/summary').json()
    assert Decimal(total['recorded_amount'])==Decimal('0.017136')


def test_missing_usage_is_pending_and_manual_reconcile(env):
    client,factory,ids=env
    task,_=submit(client,ids)
    execute_mock(lambda request:httpx.Response(200,json=chat_response(False)))
    result=client.get('/api/v1/tasks/'+task['id']).json()
    assert result['status']=='succeeded' and result['billing']['amount'] is None
    assert client.get('/api/v1/usage/summary').json()['pending_count']==1
    body={'meters':{'input_tokens':'800','output_tokens':'100','cache_read_tokens':'200'},'reason':'核对供应商记录','evidence_reference':'vendor-record-123'}
    for _ in range(2):assert client.post(f"/api/v1/admin/tasks/{task['id']}/reconcile",json=body).status_code==200
    with factory() as db:assert db.scalar(select(func.count()).select_from(Entry))==2


def test_unknown_submission_does_not_resubmit(env):
    client,factory,ids=env
    task,_=submit(client,ids)
    def timeout(request):raise httpx.ReadTimeout('simulated',request=request)
    execute_mock(timeout)
    assert client.get('/api/v1/tasks/'+task['id']).json()['status']=='reconciling'
    with factory() as db:
        db.get(Task,task['id']).next_at=0;db.commit()
    assert worker.claim() is None


def test_cancel_before_submit(env):
    client,_,ids=env
    task,_=submit(client,ids)
    result=client.post('/api/v1/tasks/'+task['id']+'/cancel').json()
    assert result['status']=='canceled' and result['billing']['status']=='not_billable'
    assert worker.claim() is None


def test_failed_attempt_retains_provider_cost(env):
    client,factory,ids=env
    task,_=submit(client,ids)
    execute_mock(lambda request:httpx.Response(400,json=chat_response()))
    result=client.get('/api/v1/tasks/'+task['id']).json()
    assert result['status']=='failed' and result['billing']['status']=='not_billable'
    with factory() as db:
        entries=list(db.scalars(select(Entry)))
        assert len(entries)==1 and entries[0].kind=='cost'


def test_image_batch_partial_and_asset_ownership(env):
    client,factory,ids=env
    buffer=io.BytesIO();Image.new('RGB',(20,30)).save(buffer,format='PNG')
    with factory() as db:
        offering=db.get(Offering,ids['offering']);offering.operation='image.generate';offering.adapter='openai_image';offering.parameters={'n':{'type':'integer','min':1,'max':4,'default':2}}
        for price in db.scalars(select(Price)):price.components=[{'meter':'images','unit_size':'1','unit_price':'0.1'}]
        db.commit()
    body=payload(ids,operation='image.generate',input={'prompt':'test','parameters':{'n':2}})
    task,_=submit(client,ids,body)
    execute_mock(lambda request:httpx.Response(200,json={'data':[{'b64_json':base64.b64encode(buffer.getvalue()).decode()}]}))
    result=client.get('/api/v1/tasks/'+task['id']).json()
    assert result['status']=='partially_succeeded'
    assert Decimal(result['billing']['amount'])==Decimal('0.84')
    asset_url=result['result']['assets'][0]['url']
    assert client.get(asset_url).content==buffer.getvalue()
    login=client.post('/api/v1/auth/login',json={'username':'other','password':'test-password-123'}).json()
    client.headers['X-CSRF-Token']=login['csrf_token']
    assert client.get(asset_url).status_code==404


def test_async_video_polling_and_pricing(env):
    client,factory,ids=env
    with factory() as db:
        model=db.get(Offering,ids['offering']);model.operation='video.generate';model.adapter='json_async';model.parameters={'duration':{'type':'integer','enum':[5],'default':5}}
        model.config={'submit_path':'/videos','body':{'model':'{{model}}','prompt':'{{input.prompt}}'},'status_path':'/videos/{id}','request_id_path':'id','status_field':'status','output_path':'outputs','usage_paths':{'video_seconds':'usage.seconds'}}
        for price in db.scalars(select(Price)):price.components=[{'meter':'video_seconds','unit_size':'1','unit_price':'0.1'}]
        db.commit()
    task,_=submit(client,ids,payload(ids,operation='video.generate',input={'prompt':'video','parameters':{'duration':5}}))
    execute_mock(lambda request:httpx.Response(200,json={'id':'remote-video','status':'running'}))
    with factory() as db:db.get(Task,task['id']).next_at=0;db.commit()
    calls=[]
    def response(request):
        calls.append(request.method)
        if request.url.path=='/output.mp4':return httpx.Response(200,content=b'fake-video',headers={'Content-Type':'video/mp4'})
        return httpx.Response(200,json={'status':'completed','outputs':['https://provider.example/output.mp4'],'usage':{'seconds':5}})
    execute_mock(response)
    assert calls==['GET','GET']
    result=client.get('/api/v1/tasks/'+task['id']).json()
    assert result['status']=='succeeded' and Decimal(result['billing']['amount'])==Decimal('4.2')


def test_worker_crash_after_submit_is_ambiguous(env):
    client,factory,ids=env
    task,_=submit(client,ids)
    claim=worker.claim();assert claim
    with factory() as db:db.get(Task,task['id']).lease_until=0;db.commit()
    assert worker.claim() is None
    assert client.get('/api/v1/tasks/'+task['id']).json()['status']=='reconciling'


def test_adjustment_idempotency_and_net_total(env):
    client,factory,ids=env
    task,_=submit(client,ids)
    execute_mock(lambda request:httpx.Response(200,json=chat_response()))
    with factory() as db:entry=db.scalar(select(Entry).where(Entry.kind=='sale'));entry_id=entry.id
    body={'original_entry_id':entry_id,'amount':'-0.01','reason':'确认费用调整'}
    for _ in range(2):assert client.post('/api/v1/admin/charge-adjustments',json=body,headers={'Idempotency-Key':'adjust-key-123'}).status_code==200
    assert Decimal(client.get('/api/v1/usage/summary').json()['recorded_amount'])==Decimal('0.007136')
    body['amount']='-0.02'
    assert client.post('/api/v1/admin/charge-adjustments',json=body,headers={'Idempotency-Key':'adjust-key-123'}).status_code==409


def test_concurrent_submission(env):
    client,factory,ids=env
    if factory.kw['bind'].dialect.name!='postgresql':pytest.skip('PostgreSQL row locks required')
    body=payload(ids)
    quote=client.post('/api/v1/pricing/estimate',json=body).json()
    body={**body,'quote_id':quote['quote_id']}
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses=list(pool.map(lambda _:client.post('/api/v1/tasks',json=body,headers={'Idempotency-Key':'concurrent-key'}),range(4)))
    assert all(response.status_code==202 for response in responses),[response.text for response in responses]
    assert len({response.json()['id'] for response in responses})==1


def test_preset_import_stays_draft(env):
    client,factory,ids=env
    response=client.get('/api/v1/admin/model-presets')
    assert response.status_code==200
    slug=response.json()['items'][0]['id']
    imported=client.post('/api/v1/admin/model-presets/'+slug).json()
    repeated=client.post('/api/v1/admin/model-presets/'+slug).json()
    assert repeated['model_id']==imported['model_id'] and not repeated['created']
    assert imported['model_id'] not in [item['id'] for item in client.get('/api/v1/models').json()['items']]
    with factory() as db:
        prices=list(db.scalars(select(Price).where(Price.offering_id==imported['model_id'])))
        assert len(prices)==2 and all(price.published_at is None for price in prices)


def test_minimax_h3_protocol_and_usage(env):
    client,factory,ids=env
    with factory() as db:
        model=db.get(Offering,ids['offering']);model.operation='video.generate';model.adapter='minimax_h3';model.upstream_model='MiniMax-H3'
        model.parameters={'resolution':{'type':'string','enum':['768P'],'default':'768P'},'duration':{'type':'integer','min':4,'max':15,'default':5}}
        for price in db.scalars(select(Price)):
            price.components=[{'meter':'video_seconds','unit_size':'1','unit_price':'0.5'}];price.currency='CNY';price.fx='1'
        db.commit()
    task,_=submit(client,ids,payload(ids,operation='video.generate',input={'prompt':'test','parameters':{'duration':5,'resolution':'768P'}}))
    def accepted(request):
        assert request.url.path=='/v2/video_generation'
        return httpx.Response(200,json={'task_id':'h3-job'})
    execute_mock(accepted)
    with factory() as db:db.get(Task,task['id']).next_at=0;db.commit()
    def completed(request):
        if request.url.path=='/output.mp4':return httpx.Response(200,content=b'video-fixture',headers={'Content-Type':'video/mp4'})
        assert request.url.path=='/v2/query/video_generation/h3-job'
        return httpx.Response(200,json={'task':{'id':'h3-job','status':'succeeded','content':{'url':'https://provider.example/output.mp4'},'usage':{'output_seconds':5,'input_seconds':0}}})
    execute_mock(completed)
    assert Decimal(client.get('/api/v1/tasks/'+task['id']).json()['billing']['amount'])==Decimal('3')


def test_output_download_failure_never_regenerates(env):
    client,factory,ids=env
    buffer=io.BytesIO();Image.new('RGB',(20,30)).save(buffer,format='PNG')
    with factory() as db:
        model=db.get(Offering,ids['offering']);model.operation='image.generate';model.adapter='openai_image';model.parameters={}
        for price in db.scalars(select(Price)):price.components=[{'meter':'images','unit_size':'1','unit_price':'0.1'}]
        db.commit()
    task,_=submit(client,ids,payload(ids,operation='image.generate',input={'prompt':'test','parameters':{}}))
    calls=[]
    def first(request):
        calls.append(request.method)
        return httpx.Response(200,json={'data':[{'url':'https://provider.example/image.png'}]}) if request.method=='POST' else httpx.Response(503)
    execute_mock(first)
    assert client.get('/api/v1/tasks/'+task['id']).json()['status']=='reconciling'
    with factory() as db:db.get(Task,task['id']).next_at=0;db.commit()
    def second(request):
        calls.append(request.method)
        return httpx.Response(200,content=buffer.getvalue(),headers={'Content-Type':'image/png'})
    execute_mock(second)
    assert calls==['POST','GET','GET']
    assert client.get('/api/v1/tasks/'+task['id']).json()['status']=='succeeded'


def test_server_error_is_ambiguous_not_retryable_submit(env):
    client,factory,ids=env
    task,_=submit(client,ids)
    execute_mock(lambda request:httpx.Response(500,json={'error':'internal'}))
    assert client.get('/api/v1/tasks/'+task['id']).json()['status']=='reconciling'
    with factory() as db:db.get(Task,task['id']).next_at=0;db.commit()
    assert worker.claim() is None


def test_official_presets_and_optional_template_fields():
    from app.presets import presets
    from app.services import validate_offering
    from app.providers import template, interpret
    catalog=presets()
    assert len(catalog)==16
    assert len({item["id"] for item in catalog}) == len(catalog)
    for item in catalog:validate_offering(item['offering'])
    image=next(item for item in catalog if item['id']=='seedream-5-pro')['offering']
    body=template(image['config']['body'],{'model':image['upstream_model'],'input':{'prompt':'test','parameters':{'size':'2K'}},'images':None})
    assert body['model']=='doubao-seedream-5-0-pro-260628' and 'image' not in body
    assert interpret({'adapter':'minimax_h3','config':{}},{'task':{'status':'queued'}})['state']=='running'
    assert interpret({'adapter':'minimax_h3','config':{}},{'task':{'status':'succeeded'}})['state']=='reconciling'
