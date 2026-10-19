"""Reproducible, isolated harness comparison. Real models only with --live.

All creative tools act on synthetic SQLite data. A loopback-only gateway owns
the provider key; child harnesses receive a dummy key and no production access.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from domain import Canvas

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]


def load_provider():
    sys.path[:0]=[str(REPO),str(REPO/'server')]
    import dev
    _,env=dev.configuration()
    os.environ.update({k:env[k] for k in ['DATABASE_URL','ASSET_DIR']})
    from app.db import Session
    from app.models import Offering,Channel
    from app.channel_credentials import resolve_channel_secret
    from sqlalchemy import select
    import httpx
    with Session() as db:
        matches=[(o,c) for o,c in db.execute(select(Offering,Channel).join(Channel,Offering.channel_id==Channel.id)
            .where(Offering.active==True,Channel.active==True,Offering.operation=='text.generate'))
            if 'deepseek' in o.upstream_model.lower() and 'flash' in o.upstream_model.lower()]
        if len(matches)!=1: raise RuntimeError('Need exactly one enabled DeepSeek Flash offering')
        offering,channel=matches[0]
        secret=resolve_channel_secret(db,channel)
        if not secret: raise RuntimeError('Configured provider has no credential')
        endpoint=channel.base_url.rstrip('/')+offering.config.get('submit_path','/v1/chat/completions')
        model=offering.upstream_model
    budget={'requests':0,'input_tokens':0,'output_tokens':0,'cache_hit_tokens':0}
    lock=threading.Lock()
    def invoke(body):
        with lock:
            if budget['requests']>=40: raise RuntimeError('LIVE_REQUEST_BUDGET_EXHAUSTED')
            budget['requests']+=1
        request={k:body[k] for k in ['messages','tools','tool_choice'] if k in body}
        request.update(model=model,max_tokens=2048,temperature=0,stream=False,thinking={'type':'disabled'})
        with httpx.Client(timeout=75,follow_redirects=False) as client:
            response=client.post(endpoint,headers={'Authorization':'Bearer '+secret},json=request)
        if response.status_code!=200:
            raise RuntimeError('Provider HTTP '+str(response.status_code))
        data=response.json()
        usage=data.get('usage',{})
        with lock:
            budget['input_tokens']+=usage.get('prompt_tokens',0)
            budget['output_tokens']+=usage.get('completion_tokens',0)
            budget['cache_hit_tokens']+=usage.get('prompt_cache_hit_tokens',0)
        return data
    return invoke,{'model':model,'endpoint':endpoint,'thinking':'disabled','max_tokens_per_request':2048,'budget':budget}


class Bridge:
    def __init__(self,root,script,provider=None,fault=None):
        self.root=root; self.canvas=Canvas(root/'canvas.sqlite'); self.script=list(script)
        self.provider=provider; self.fault=fault; self.index=0; self.requests=[]
        self.barrier=threading.Event(); self.release=threading.Event(); self.committed=threading.Event()
        self.request_lock=threading.Lock()
        self.started=time.monotonic(); self.first_tool=None
        bridge=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_POST(self):
                try:
                    body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    if self.path=='/tool':
                        if bridge.first_tool is None: bridge.first_tool=time.monotonic()-bridge.started
                        name,args=body['name'],body['args']
                        if name=='wait_for_signal':
                            bridge.barrier.set(); bridge.release.wait(30)
                        if bridge.fault=='conflict' and name=='edit_node':
                            bridge.canvas.manual_edit(); bridge.fault=None
                        data=bridge.canvas.call(name,args)
                        if bridge.fault=='crash' and name=='submit_generation':
                            bridge.committed.set(); bridge.release.wait(30)
                    elif self.path=='/await_barrier':
                        data={'ready':bridge.barrier.wait(25)}
                    elif self.path=='/release':
                        bridge.release.set(); data={'ok':True}
                    elif self.path.endswith('/chat/completions'):
                        with bridge.request_lock:
                            if len(bridge.requests)>=16: raise RuntimeError('PER_CASE_REQUEST_LIMIT')
                            if bridge.provider:
                                data=bridge.provider(body)
                            else:
                                call=bridge.script[bridge.index] if bridge.index<len(bridge.script) else None
                                bridge.index+=1
                                msg={'role':'assistant','content':'已完成测试步骤。'}
                                if call:
                                    msg={'role':'assistant','content':None,'tool_calls':[{
                                        'id':f'call-{bridge.index}','type':'function',
                                        'function':{'name':call[0],'arguments':json.dumps(call[1])}}]}
                                data={'id':f'completion-{bridge.index}','object':'chat.completion',
                                      'created':int(time.time()),'model':body.get('model'),
                                      'choices':[{'index':0,'message':msg,'finish_reason':'tool_calls' if call else 'stop'}],
                                      'usage':{'prompt_tokens':1,'completion_tokens':1,'total_tokens':2}}
                            bridge.requests.append({'request':body,'response':data})
                            (bridge.root/'model.json').write_text(json.dumps(bridge.requests,ensure_ascii=False,indent=2))
                        if body.get('stream'):
                            self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
                            choice=data['choices'][0]; message=choice['message']
                            delta={'role':'assistant'}
                            if message.get('content'): delta['content']=message['content']
                            if message.get('reasoning_content'): delta['reasoning_content']=message['reasoning_content']
                            if message.get('tool_calls'):
                                delta['tool_calls']=[dict(c,index=i) for i,c in enumerate(message['tool_calls'])]
                            chunk={'id':data['id'],'object':'chat.completion.chunk','created':int(time.time()),
                                   'model':data.get('model'),'choices':[{'index':0,'delta':delta,'finish_reason':None}]}
                            self.wfile.write(('data: '+json.dumps(chunk)+'\n\n').encode())
                            chunk['choices']=[{'index':0,'delta':{},'finish_reason':choice['finish_reason']}]
                            chunk['usage']=data.get('usage',{})
                            self.wfile.write(('data: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n').encode()); self.wfile.flush()
                            return
                    else: raise RuntimeError('UNKNOWN_BRIDGE_PATH')
                    encoded=json.dumps(data).encode()
                    self.send_response(200); self.send_header('Content-Type','application/json')
                    self.send_header('Content-Length',str(len(encoded))); self.end_headers(); self.wfile.write(encoded)
                except (BrokenPipeError,ConnectionResetError): pass
                except Exception as exc:
                    # Provider errors are deliberately reduced to class/status, never credentials.
                    error={'error':type(exc).__name__+': '+str(exc)[:180]}
                    (bridge.root/'bridge-errors.jsonl').open('a').write(json.dumps(error)+'\n')
                    self.send_response(500); self.end_headers(); self.wfile.write(json.dumps(error).encode())
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.url=f'http://127.0.0.1:{self.server.server_port}'

    def close(self):
        self.release.set(); self.server.shutdown(); self.server.server_close()


def launch(args,harness,root,bridge,prompts,steer=None):
    # Allowlist env: never inherit API keys, credentials or the production DB URL.
    env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG'] if k in os.environ}
    env.update(BENCH_URL=bridge.url,BENCH_RUN=str(root),BENCH_HARNESS=harness,
               BENCH_PROMPTS=json.dumps(prompts),DSH_CHECKOUT=str(args.dsh_checkout),
               LANGSMITH_TRACING='false',LANGCHAIN_TRACING_V2='false')
    if steer: env['BENCH_STEER']=steer
    if root.name.endswith('-approval'): env['BENCH_APPROVAL']='1'
    return subprocess.Popen([str(args.python),str(HERE/'worker.py')],env=env,cwd=root,
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)


def settle(proc,timeout=120):
    try: out,err=proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid,signal.SIGKILL); out,err=proc.communicate(); err+='\nBENCH_TIMEOUT'
    return {'returncode':proc.returncode,'stdout':out,'stderr':err[-14000:]}


def case(args,harness,name,script,prompts,provider=None,fault=None):
    root=args.output/f'{harness}-{name}'; root.mkdir()
    bridge=Bridge(root,script,provider,fault)
    start=time.monotonic()
    try:
        proc=launch(args,harness,root,bridge,prompts,
                    '停止后续生成，只查询画布。' if name=='steer' and harness.startswith('dsh') else None)
        if name=='steer' and harness=='deepagents':
            # No claim of native steer: interrupt/resume is tested separately.
            bridge.release.set()
        if fault=='crash':
            if bridge.committed.wait(35):
                os.killpg(proc.pid,signal.SIGKILL); first=settle(proc)
                bridge.fault=None; bridge.release.set()
                resume=['__RESUME__'] if harness=='deepagents' else ['恢复上次任务，核对 action_id=gen-b，不要重复创建。']
                proc=launch(args,harness,root,bridge,resume)
                execution={'killed_after_commit':True,'first':first,'recovery':settle(proc)}
            else:
                execution={'killed_after_commit':False,'first':settle(proc,2)}
        elif name in ['restart','approval']:
            first=settle(proc)
            before=bridge.canvas.snapshot()
            proc=launch(args,harness,root,bridge,['__APPROVE__' if name=='approval' else '继续上次会话，查询刚才的任务。'])
            execution={'first':first,'before_resume':before,'recovery':settle(proc)}
        else: execution=settle(proc)
        result=dict(harness=harness,case=name,mode='live' if provider else 'scripted',
                    seconds=round(time.monotonic()-start,3),first_tool_seconds=bridge.first_tool,
                    execution=execution,snapshot=bridge.canvas.snapshot(),audit=bridge.canvas.audit(),
                    model_requests=len(bridge.requests),usage=[x['response'].get('usage',{}) for x in bridge.requests])
        (root/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        return result
    finally: bridge.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path)
    parser.add_argument('--python',type=Path,default=Path('/private/tmp/elren-harness-venv/bin/python'))
    parser.add_argument('--dsh-checkout',type=Path,default=Path('/Users/megumi/Develop/Siran'))
    parser.add_argument('--live',action='store_true')
    parser.add_argument('--harness',choices=['dsh','dsh-bridge','deepagents','both'],default='both')
    parser.add_argument('--case',default='all')
    parser.add_argument('--repetitions',type=int,default=1)
    args=parser.parse_args()
    args.output=args.output or Path(tempfile.mkdtemp(prefix='elren-harness-bench-'))
    args.output.mkdir(parents=True,exist_ok=True)
    provider,meta=load_provider() if args.live else (None,{'model':'scripted fixture; not an intelligence benchmark'})
    results=[]
    read=('read_canvas',{})
    edit=('edit_node',dict(node_id='shot-b',expected_version=1,prompt='方向2：银色水杯，冷色背景',ratio='9:16',action_id='edit-b'))
    submit=('submit_generation',dict(node_id='shot-b',action_id='gen-b'))
    get=('get_task',dict(task_id='task-gen-b'))
    definitions={
        'chain':([read,edit,submit,get,None],['将选中的第二张海报改成冷色竖版并生成一次。']),
        'conflict':([read,edit,read,None],['将选中的第二张改成竖版。']),
        'crash':([read,submit,submit,get,None],['生成选中的第二张，操作 ID 为 gen-b。']),
        'restart':([read,submit,None,get,None],['生成选中的第二张。']),
        'steer':([('wait_for_signal',{}),read,None],['先等待信号，之后再处理下一步。']),
        'approval':([read,submit,get,None],['生成选中的第二张。']),
    }
    for harness in (['dsh','deepagents'] if args.harness=='both' else [args.harness]):
        if args.live:
            for rep in range(args.repetitions):
                result=case(args,harness,f'live-{rep+1}',[],[
                    '选中的三个节点同名。只把第二张改成 9:16 竖版、冷色背景，保留银色水杯及参考图，不要生成。',
                    '为刚才修改的那张生成一次，其他两张不动。',
                    '刚才那个任务现在是什么状态？只查询，别重新生成。'],provider)
                results.append(result); print(json.dumps({'harness':harness,'case':result['case'],'seconds':result['seconds'],'model_requests':result['model_requests']},ensure_ascii=False),flush=True)
        else:
            for name,(script,prompts) in definitions.items():
                if name=='approval' and harness!='deepagents': continue
                if name=='steer' and not harness.startswith('dsh'): continue
                if args.case not in ['all',name]: continue
                result=case(args,harness,name,script,prompts,fault=name if name in ['crash','conflict'] else None)
                results.append(result); print(json.dumps({'harness':harness,'case':name,'seconds':result['seconds'],'model_requests':result['model_requests']},ensure_ascii=False),flush=True)
    metadata={'provider':meta,'dsh_commit':subprocess.check_output(['git','-C',str(args.dsh_checkout),'rev-parse','HEAD'],text=True).strip(),
              'python':str(args.python),'results':results}
    (args.output/'summary.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    print('RESULTS '+str(args.output),flush=True)


if __name__=='__main__': main()
