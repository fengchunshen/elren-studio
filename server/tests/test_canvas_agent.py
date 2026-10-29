import asyncio
import time
import uuid
from unittest.mock import AsyncMock
from sqlalchemy import select
from app import canvas_agent_runtime as runtime
from app.models import CanvasAgentSession, CanvasAgentAction, Offering, Price, Task


def test_workflow_tool_contract_rejects_incomplete_or_fabricated_workflows():
    import json
    import pytest
    from app.canvas_agent_contract import validate_tool, TOOLS
    assert {'read_workflow_library','apply_workflow','inspect_workflow'} <= {tool['name'] for tool in TOOLS}
    assert validate_tool('read_workflow_library', {}) == {}
    assert validate_tool('inspect_workflow', {'node_ids':['node-a']}) == {'node_ids':['node-a']}
    plan = {'name':'短剧','nodes':[{'key':'script','type':'text-node','text':'原创剧本'},
            {'key':'frames','type':'storyboard-node','stage':'image','shots':[{'id':'s1','title':'开场','prompt':'构图'}]}],
            'connections':[{'source':'script','target':'frames'}]}
    def run(value): return validate_tool('apply_workflow', {'workflow_json':json.dumps(value)})
    assert run(plan)['nodes'][1]['shots'][0]['duration'] == '5s'
    assert validate_tool('apply_workflow', {'workflow':plan}) == run(plan)
    spec = next(tool for tool in TOOLS if tool['name'] == 'apply_workflow')['parameters']['workflow']
    assert spec['properties']['nodes']['items']['properties']['key']['required'] is True
    assert spec['properties']['nodes']['items']['properties']['shots']['items']['properties']['image_source']['type'] == 'object'
    with pytest.raises(ValueError): run(plan | {'connections':[]})
    with pytest.raises(ValueError): run(plan | {'nodes':[plan['nodes'][0],plan['nodes'][0]]})
    with pytest.raises(ValueError): run(plan | {'nodes':[plan['nodes'][0],plan['nodes'][1] | {'stage':'video'}]})
    with pytest.raises(ValueError): run(plan | {'nodes':[plan['nodes'][0],plan['nodes'][1] | {'content':'fake.png'}]})
    with pytest.raises(ValueError): run(plan | {'nodes':[plan['nodes'][0] | {'id':'existing'},plan['nodes'][1]]})


def test_official_fake_ip_exception_is_narrow(monkeypatch):
    import pytest
    monkeypatch.setattr(runtime.socket,'getaddrinfo',lambda *a,**kw:[(2,1,6,'',('198.18.0.140',443))])
    runtime.validate_agent_endpoint('https://api.deepseek.com/chat/completions')
    for url in ['https://evil.example/chat/completions','https://api.deepseek.com:8443/chat/completions','http://api.deepseek.com/chat/completions']:
        with pytest.raises(ValueError): runtime.validate_agent_endpoint(url)
    monkeypatch.setattr(runtime.socket,'getaddrinfo',lambda *a,**kw:[(2,1,6,'',('127.0.0.1',443))])
    with pytest.raises(ValueError):runtime.validate_agent_endpoint('https://api.deepseek.com/chat/completions')


def make_session(client, ids, monkeypatch):
    monkeypatch.setattr(runtime, 'available', lambda: True)
    monkeypatch.setattr('app.canvas_agent_api.summarize_title', AsyncMock())
    response=client.post('/api/v1/canvas-agent/sessions',json={'project_id':ids['project'],'model_id':ids['offering'],'client_id':'test-browser'})
    assert response.status_code==201,response.text
    return response.json()['id']


def test_history_rename_archive_and_running_guard(env, monkeypatch):
    from app.canvas_agent_titles import needs_title
    client, factory, ids = env
    sid = make_session(client, ids, monkeypatch)
    base = '/api/v1/canvas-agent/sessions/' + sid
    assert client.patch(base, json={'title':'  '}).status_code == 400
    changed = client.patch(base, json={'title':'  手工标题  '})
    assert changed.status_code == 200
    assert changed.json()['title'] == '手工标题'
    with factory() as db:
        row = db.get(CanvasAgentSession, sid)
        assert row.title_manual and not needs_title(row)
        row.status = 'running'
        row.lease_until = time.time() + 60
        db.commit()
    assert client.delete(base).status_code == 409
    with factory() as db:
        row = db.get(CanvasAgentSession, sid)
        row.status = 'idle'; row.lease_until = 0
        db.commit()
    assert client.delete(base).status_code == 200
    assert client.get(base, params={'client_id':'test-browser'}).status_code == 404
    assert client.patch(base, json={'title':'恢复'}).status_code == 404
    assert client.get('/api/v1/canvas-agent/sessions', params={'project_id':ids['project']}).json()['items'] == []
    with factory() as db:
        assert db.get(CanvasAgentSession, sid).archived


def test_title_summarizes_only_first_prompt_and_preserves_history(env, monkeypatch):
    from app.canvas_agent_titles import summarize_title
    client, factory, ids = env
    sid = make_session(client, ids, monkeypatch)
    first = '请生成自然、温暖、克制的中文广告旁白，融入山野来信品牌口号。'
    messages = [{'id':'first', 'role':'user', 'content':first},
                {'id':'later', 'role':'user', 'content':'再做一个视频'}]
    with factory() as db:
        row = db.get(CanvasAgentSession, sid)
        row.messages = messages
        row.title = first[:40]
        db.commit()
    model = AsyncMock(return_value={'choices':[{'message':{'content':'山野来信广告旁白创作'}}]})
    monkeypatch.setattr(runtime.AgentProcess, 'model', model)
    asyncio.run(summarize_title(sid, factory.kw['bind']))
    assert model.call_args.args[0]['messages'][-1]['content'] == first
    assert model.call_args.kwargs == {'title_only':True}
    with factory() as db:
        row = db.get(CanvasAgentSession, sid)
        assert row.title == '山野来信广告旁白创作'
        assert row.messages == messages
    asyncio.run(summarize_title(sid, factory.kw['bind']))
    assert model.call_count == 1


def test_title_failure_does_not_break_conversation_or_expose_raw_prompt(env, monkeypatch):
    from app.canvas_agent_titles import summarize_title
    client, factory, ids = env
    sid = make_session(client, ids, monkeypatch)
    with factory() as db:
        row = db.get(CanvasAgentSession, sid)
        row.messages = [{'id':'first', 'role':'user', 'content':'写一篇广告旁白'}]
        row.title = '写一篇广告旁白'
        db.commit()
    monkeypatch.setattr(runtime.AgentProcess, 'model', AsyncMock(side_effect=ValueError('unavailable')))
    asyncio.run(summarize_title(sid, factory.kw['bind']))
    response = client.get(f'/api/v1/canvas-agent/sessions/{sid}?client_id=test-browser')
    assert response.json()['title'] == '未命名对话'
    assert response.json()['messages'][0]['content'] == '写一篇广告旁白'
    assert response.json()['status'] == 'idle'


def action(factory, sid, tool='read_canvas', status='pending'):
    with factory() as db:
        row=db.get(CanvasAgentSession,sid);row.status='waiting_canvas';row.lease_until=time.time()+60
        item=CanvasAgentAction(session_id=sid,call_id=str(uuid.uuid4()),tool=tool,arguments={'node_id':'node-b','expected_version':'v1'} if tool=='generate_node' else {},status=status)
        db.add(item);db.commit();return item.id


def test_project_auth_client_and_action_receipts(env,monkeypatch):
    client,factory,ids=env;sid=make_session(client,ids,monkeypatch)
    assert client.post('/api/v1/canvas-agent/sessions',json={'project_id':ids['other_project'],'model_id':ids['offering'],'client_id':'test-browser'}).status_code==404
    identity=action(factory,sid)
    path=f'/api/v1/canvas-agent/actions/{identity}/result'
    assert client.post(path,json={'client_id':'wrong-browser','result':{}}).status_code==409
    result={'nodes':[]}
    assert client.post(path,json={'client_id':'test-browser','result':result}).status_code==200
    replay=client.post(path,json={'client_id':'test-browser','result':{'nodes':['different']}})
    assert replay.json()['result']==result
    client.post('/api/v1/auth/logout')
    r=client.post('/api/v1/auth/login',json={'username':'other','password':'test-password-123'})
    client.headers['X-CSRF-Token']=r.json()['csrf_token']
    assert client.get(f'/api/v1/canvas-agent/sessions/{sid}?client_id=test-browser').status_code==404


def test_message_identity_and_stop(env,monkeypatch):
    client,factory,ids=env;sid=make_session(client,ids,monkeypatch)
    launch=AsyncMock();monkeypatch.setattr(runtime,'launch',launch)
    body={'id':'message-123','text':'创建三个方向','client_id':'test-browser'}
    path=f'/api/v1/canvas-agent/sessions/{sid}/messages'
    assert client.post(path,json=body).status_code==202
    assert client.post(path,json=body).status_code==202
    assert launch.call_count==1
    assert client.post(path,json=body|{'text':'不同内容'}).status_code==409
    identity=action(factory,sid)
    assert client.post(f'/api/v1/canvas-agent/sessions/{sid}/stop').status_code==200
    response=client.get(f'/api/v1/canvas-agent/sessions/{sid}?client_id=test-browser').json()
    assert response['status']=='stopped'
    assert response['actions'][0]['status']=='canceled'
    assert not response['actions'][0]['can_execute']


def test_message_reference_snapshots_persist_and_reach_the_runtime(env,monkeypatch):
    client,factory,ids=env;sid=make_session(client,ids,monkeypatch)
    launch=AsyncMock();monkeypatch.setattr(runtime,'launch',launch)
    reference={'node_id':'node-b','title':'产品图','type':'gen-image','version':'v1','text':'','prompt':'银色水杯','media_types':['image']}
    body={'id':'referenced-message','text':'按这张图继续','client_id':'test-browser','references':[reference]}
    path=f'/api/v1/canvas-agent/sessions/{sid}/messages'
    response=client.post(path,json=body);assert response.status_code==202,response.text
    assert response.json()['messages'][-1]['references']==[reference]
    assert 'node-b' in launch.call_args.args[1] and '银色水杯' in launch.call_args.args[1]
    assert client.post(path,json=body|{'references':[]}).status_code==409
    assert client.post(path,json=body|{'id':'another-message','references':[reference,reference]}).status_code==400
    assert client.post(path,json=body|{'id':'bad-preview','references':[reference|{'preview_url':'https://private.invalid'}]}).status_code==422


def test_generation_requires_confirmation_and_reuses_task_after_lost_response(env,monkeypatch):
    client,factory,ids=env;sid=make_session(client,ids,monkeypatch)
    identity=action(factory,sid,'generate_node','approval')
    with factory() as db:
        model=Offering(name='Test image',channel_id=ids['channel'],upstream_model='test-image',operation='image.generate',adapter='openai_image',parameters={},config={},active=True)
        db.add(model);db.flush();mid=model.id
        for kind in ['sale','cost']:
            db.add(Price(offering_id=mid,kind=kind,currency='CNY',display_currency='CNY',fx='1',markup='0',components=[{'meter':'images','unit_size':'1','unit_price':'1'}],source='test',published_at=time.time()))
        db.commit()
    path=f'/api/v1/canvas-agent/actions/{identity}'
    body={'client_id':'test-browser','model_id':mid,'input':{'prompt':'test','parameters':{}}}
    assert client.post(path+'/generate',json=body).status_code==409
    assert client.post(path+'/decision',json={'client_id':'test-browser','approve':True}).status_code==200
    first=client.post(path+'/generate',json=body);assert first.status_code==200,first.text
    second=client.post(path+'/generate',json=body);assert second.status_code==200,second.text
    assert first.json()['id']==second.json()['id']
    with factory() as db: assert len(list(db.scalars(select(Task))))==1


def test_real_dsh_runtime_round_trip_and_resume(env,monkeypatch):
    client,factory,ids=env
    if not runtime.available():
        import pytest
        pytest.skip('npm runtime not installed')
    sid=make_session(client,ids,monkeypatch)
    count=0
    async def scripted(self,body):
        nonlocal count
        count+=1
        assert any(t['function']['name']=='read_canvas' for t in body['tools'])
        message={'role':'assistant','content':'已读取实际画布。'}
        if count==1:message={'role':'assistant','content':None,'tool_calls':[{'id':'read-1','type':'function','function':{'name':'read_canvas','arguments':'{}'}}]}
        return {'choices':[{'message':message}]}
    monkeypatch.setattr(runtime.AgentProcess,'model',scripted)
    async def run():
        engine=factory.kw['bind']
        await runtime.launch(sid,'读取画布',engine)
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            with factory() as db:
                pending=db.scalar(select(CanvasAgentAction).where(CanvasAgentAction.session_id==sid,CanvasAgentAction.result.is_(None)))
                if pending:pending.result={'nodes':[]};pending.status='done';db.commit()
                row=db.get(CanvasAgentSession,sid)
                if row.status=='idle' and row.messages:break
            await asyncio.sleep(.1)
        else:raise AssertionError('Runtime did not deliver assistant message')
        await runtime.PROCESSES[sid].close()
        await runtime.launch(sid,'继续',engine)
        await asyncio.sleep(1)
        await runtime.PROCESSES[sid].close()
        with factory() as db:
            row=db.get(CanvasAgentSession,sid)
            assert row.messages[-1]['content']=='已读取实际画布。'
        assert count>=3
    asyncio.run(run())


def test_model_response_and_usage_are_recorded_together(env,monkeypatch):
    import httpx
    from app.models import Entry,Attempt
    client,factory,ids=env;sid=make_session(client,ids,monkeypatch)
    process=runtime.AgentProcess(sid,factory.kw['bind'])
    with factory() as db:
        row=db.get(CanvasAgentSession,sid);row.lease_owner=process.owner;db.commit()
    original=httpx.AsyncClient
    response={'choices':[{'message':{'role':'assistant','content':'已完成'}}],
              'usage':{'prompt_tokens':100,'completion_tokens':20,'prompt_tokens_details':{'cached_tokens':30}}}
    monkeypatch.setattr(runtime,'validate_agent_endpoint',lambda endpoint:None)
    monkeypatch.setattr(runtime.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(lambda request:httpx.Response(200,json=response))))
    result=asyncio.run(process.model({'messages':[{'role':'user','content':'测试'}],'tools':[]}))
    assert result==response
    with factory() as db:
        task=db.scalar(select(Task));attempt=db.scalar(select(Attempt))
        assert task.status=='succeeded'
        assert task.billing_status=='recorded'
        assert attempt.response==response
        assert len(list(db.scalars(select(Entry))))==2
