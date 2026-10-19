"""Run installed Deep Agents or existing DSH SDK; model and tools use a loopback test bridge."""
import json
import os
from pathlib import Path
import sys
import threading
import urllib.request

from domain import SYSTEM, TOOLS

URL=os.environ['BENCH_URL']
ROOT=Path(os.environ['BENCH_RUN'])
HARNESS=os.environ['BENCH_HARNESS']
PROMPTS=json.loads(os.environ['BENCH_PROMPTS'])


def post(path, body):
    req=urllib.request.Request(URL+path,json.dumps(body).encode(),{'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=110) as response:
        return json.load(response)


def dsh():
    from pydantic import BaseModel
    class Capabilities(BaseModel):
        adapter: str
        methods: list[str]
    class Enqueued(BaseModel):
        messageId: str
    checkout=Path(os.environ['DSH_CHECKOUT'])
    sys.path.insert(0,str(checkout/'python/sdk/src'))
    from deepseek_harness import DeepSeekHarness
    plugin=ROOT/'canvas-plugin.mjs'
    lib=(checkout/'packages/core/tools/lib/index.js').as_uri()
    plugin.write_text('''import { defineTool } from %s;
export const name='elren-bench-tools'; export const inject=['tools'];
export function apply(ctx) {
 const specs=%s;
 for (const [name,description,fields] of specs) {
  const parameters=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{type:v==='integer'?'number':v,required:true}]));
  ctx.tools.register(defineTool({name,description,parameters,
   output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
   async execute(args,exec) {
    const response=await fetch(process.env.BENCH_URL+'/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args}),signal:exec.signal});
    if(!response.ok) throw new Error('bridge tool failure '+response.status);
    return JSON.stringify(await response.json());
   }}));
 }
}
'''%(json.dumps(lib),json.dumps(TOOLS)))
    # sdk-minimal is a deliberate kernel baseline; no shell or real filesystem tools are exposed.
    disabled=['session-log-deepseek','plugin-package-inventory-deepseek','persistent-bash','persistent-pwsh']
    rows=[{'id':i,'disabled':True} for i in disabled]
    rows += [dict(id='llm-deepseek',config=dict(protocol='chat-completions',baseURL=URL+'/v1',
                     apiKeyEnv='DEEPSEEK_API_KEY',thinking='disabled',maxTokens=2048,
                     retryPolicy={'mode':'normal','maxRetries':0})),
             dict(id='system-prompt',config=dict(includeHarnessIdentity=False,includeRuntimeContext=False,personaPrefix=SYSTEM)),
             {'insert':[
                 dict(id='elren-bench-checkpoints',name=str(checkout/'packages/session/session-checkpoint-policy/lib/index.js')),
                 dict(id='elren-bench-tools',name=str(plugin))]}]
    if HARNESS=='dsh-bridge':
        rows.append(dict(id='sdk-jsonrpc-server',disabled=True))
        rows.append({'insert':[dict(id='elren-sdk-bridge',name=str(Path(__file__).with_name('dsh_bridge.mjs')))]})
    # JSON is valid YAML and avoids interpolation of test paths or prompts.
    patch=ROOT/'patch.yml'; patch.write_text(json.dumps(rows))
    with DeepSeekHarness(dsh_bin=str(checkout/'apps/cli/lib/bin.js'),profile='sdk-minimal',
             patches=(str(patch),),dsh_home=str(ROOT/'dsh-home'),cwd=str(ROOT),
             provider='deepseek-official',model='deepseek-v4-flash',max_tokens=2048,
             env={'DEEPSEEK_API_KEY':'local-test-only'},request_timeout_seconds=110) as harness:
        if HARNESS=='dsh-bridge':
            capabilities=harness.client.request('session/capabilities',{},response_model=Capabilities)
            assert capabilities.adapter=='elren-bench-adapter-v1', capabilities
        def collect(note):
            with (ROOT/'events.jsonl').open('a') as f:
                f.write(json.dumps(note.model_dump() if hasattr(note,'model_dump') else note,default=str)+'\n')
        if os.environ.get('BENCH_STEER'):
            def steer():
                post('/await_barrier',{})
                if HARNESS=='dsh-bridge':
                    harness.client.request('session/steer',{'sessionId':'canvas-session',
                        'contentBlocks':[{'type':'text','text':os.environ['BENCH_STEER']}]},response_model=Enqueued)
                else:
                    harness.client.session_prompt('canvas-session',[{'type':'text','text':os.environ['BENCH_STEER']}])
                post('/release',{})
            threading.Thread(target=steer,daemon=True).start()
        for prompt in PROMPTS:
            result=harness.run(prompt,session_id='canvas-session',on_notification=collect)
            print(json.dumps({'final':result.final_response,'finish':result.finish_reason},ensure_ascii=False),flush=True)


def deepagents():
    from deepagents import create_deep_agent
    from langchain_openai import ChatOpenAI
    from langchain_core.tools import StructuredTool
    from langgraph.checkpoint.sqlite import SqliteSaver
    from pydantic import create_model
    tools=[]
    for name,description,fields in TOOLS:
        schema=create_model(name+'Args',**{k:(int if v=='integer' else str,...) for k,v in fields.items()})
        def execute(_name=name,**kwargs):
            return json.dumps(post('/tool',dict(name=_name,args=kwargs)),ensure_ascii=False)
        tools.append(StructuredTool.from_function(execute,name=name,description=description,args_schema=schema))
    model=ChatOpenAI(model='deepseek-v4-flash',api_key='local-test-only',base_url=URL+'/v1',
                     use_responses_api=False,max_tokens=2048,max_retries=0,timeout=90)
    with SqliteSaver.from_conn_string(str(ROOT/'checkpoints.sqlite')) as checkpointer:
        agent=create_deep_agent(model=model,tools=tools,system_prompt=SYSTEM,checkpointer=checkpointer,subagents=[],
                               interrupt_on={'submit_generation':True} if os.environ.get('BENCH_APPROVAL') else None)
        config={'configurable':{'thread_id':'canvas-session'},'recursion_limit':35}
        for prompt in PROMPTS:
            from langgraph.types import Command
            payload=(Command(resume={'decisions':[{'type':'approve'}]}) if prompt=='__APPROVE__'
                     else None if prompt=='__RESUME__' else {'messages':[{'role':'user','content':prompt}]})
            for event in agent.stream(payload,config,stream_mode='updates'):
                with (ROOT/'events.jsonl').open('a') as f:
                    f.write(json.dumps(event,default=str,ensure_ascii=False)+'\n')
            state=agent.get_state(config)
            last=state.values['messages'][-1]
            print(json.dumps({'final':last.content,'finish':'waiting' if state.interrupts else 'completed'},ensure_ascii=False),flush=True)


if __name__=='__main__':
    ROOT.mkdir(parents=True,exist_ok=True)
    if HARNESS.startswith('dsh'): dsh()
    else: deepagents()
