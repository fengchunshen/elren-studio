"""DSH process host. Credentials, pricing and durable UI actions stay in the platform."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import time
import uuid
import logging
import ipaddress
import socket
from urllib.parse import urlsplit
import httpx
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from .config import settings
from .models import CanvasAgentSession, CanvasAgentAction, User, Project, Offering, Channel, Task, Attempt
from .canvas_agent_contract import SYSTEM, TOOLS, validate_tool
from .services import validate_task, offering_snapshot, record_usage, task_dict
from .pricing import snapshot, current_price, fingerprint
from .channel_credentials import resolve_channel_secret
from .security import validate_remote_url
from .providers import normalized_usage, sanitized

RUNTIME = Path(__file__).resolve().parents[1] / 'agent-runtime'
PROCESSES = {}


def available():
    return bool(shutil.which('node') and (RUNTIME / 'node_modules/@deepseek-ai/dsh/lib/bin.js').exists())


def validate_agent_endpoint(endpoint):
    """Permit the configured official DeepSeek endpoint through local fake-IP DNS.

    Only the exact public vendor hostname on HTTPS/443 qualifies; other private
    addresses remain rejected. HTTPX still verifies the vendor TLS certificate
    and never follows redirects. No user-supplied URL reaches this function.
    """
    try:
        validate_remote_url(endpoint)
    except ValueError:
        parsed = urlsplit(endpoint)
        validate_remote_url(endpoint, resolve=False)
        if parsed.scheme != 'https' or parsed.hostname != 'api.deepseek.com' or parsed.port not in [None, 443]:
            raise
        addresses = {ipaddress.ip_address(row[4][0]) for row in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
        if not addresses or not all(address in ipaddress.ip_network('198.18.0.0/15') for address in addresses):
            raise


class AgentProcess:
    def __init__(self, identity, engine):
        self.id = identity
        self.factory = sessionmaker(engine, expire_on_commit=False)
        self.owner = str(uuid.uuid4())
        self.process = None
        self.pending = {}
        self.jobs = set()
        self.stopping = False
        self.calls = 0
        self.last_activity = time.time()
        self.write_lock = asyncio.Lock()
        self.start_lock = asyncio.Lock()

    async def start(self):
        async with self.start_lock:
            if self.process and self.process.returncode is None: return
            if not available(): raise ValueError('画布助手运行环境尚未安装，请联系管理员')
            root = settings.asset_dir.parent / 'agents' / self.id
            root.mkdir(parents=True, exist_ok=True, mode=0o700)
            spec = root / 'spec.json'
            spec.write_text(json.dumps({'session_id': self.id, 'tools': TOOLS}))
            patch = [dict(id=name, disabled=True) for name in ['llm-deepseek', 'session-log-deepseek',
                     'plugin-package-inventory-deepseek', 'persistent-bash', 'persistent-pwsh', 'sdk-jsonrpc-server']]
            patch += [dict(id='system-prompt', config=dict(includeHarnessIdentity=False, includeRuntimeContext=False, personaPrefix=SYSTEM)),
                      {'insert': [dict(id='elren-checkpoints', name=str(RUNTIME / 'node_modules/@deepseek-ai/dsh-session-checkpoint-policy/lib/index.js')),
                                  dict(id='elren-canvas', name=str(RUNTIME / 'canvas.mjs'))]}]
            patch_file = root / 'patch.yml'; patch_file.write_text(json.dumps(patch))
            env = {key: os.environ[key] for key in ['PATH', 'LANG', 'TMPDIR'] if key in os.environ}
            env.update(HOME=str(root), DSH_HOME=str(root / 'home'), ELREN_AGENT_SPEC=str(spec))
            self.process = await asyncio.create_subprocess_exec(shutil.which('node'),
                str(RUNTIME / 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'sdk-minimal', '--patch', str(patch_file),
                cwd=root, env=env, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE, limit=4 * 1024 * 1024)
            self.reader = asyncio.create_task(self.read())
            self.errors = asyncio.create_task(self.drain_errors())
            await self.request('initialize', {}, timeout=30)
            self.heartbeat = asyncio.create_task(self.pulse())

    async def drain_errors(self):
        # Runtime diagnostics can contain tool data: do not forward to public messages.
        while await self.process.stderr.readline(): pass

    async def write(self, body):
        async with self.write_lock:
            if not self.process or self.process.returncode is not None: raise ValueError('助手连接已中断，请重试')
            self.process.stdin.write((json.dumps(body) + '\n').encode())
            await self.process.stdin.drain()

    async def request(self, method, params, timeout=15):
        key = str(uuid.uuid4()); future = asyncio.get_running_loop().create_future()
        self.pending[key] = future
        try:
            await self.write({'jsonrpc': '2.0', 'id': key, 'method': method, 'params': params})
            return await asyncio.wait_for(future, timeout)
        finally: self.pending.pop(key, None)

    async def read(self):
        try:
            while raw := await self.process.stdout.readline():
                item = json.loads(raw)
                if 'method' in item and 'id' in item:
                    job = asyncio.create_task(self.respond(item)); self.jobs.add(job); job.add_done_callback(self.jobs.discard)
                elif 'method' in item:
                    self.notify(item['method'], item.get('params', {}))
                elif future := self.pending.get(str(item.get('id'))):
                    if not future.done():
                        if 'error' in item: future.set_exception(ValueError('助手运行时拒绝了请求'))
                        else: future.set_result(item.get('result'))
        except (ValueError, OSError, asyncio.CancelledError): pass
        finally:
            for future in self.pending.values():
                if not future.done(): future.set_exception(ValueError('助手连接已中断'))
            if not self.stopping: self.fail('助手连接已中断，重新发送即可继续会话')

    async def respond(self, request):
        try:
            if self.stopping: raise ValueError('操作已停止')
            params = request.get('params', {})
            if request['method'] == 'model/call': value = await self.model(params)
            elif request['method'] == 'canvas/tool': value = await self.tool(params)
            else: raise ValueError('未知助手能力')
            await self.write({'id': request['id'], 'result': value})
        except Exception as error:
            logging.getLogger(__name__).warning('Canvas agent %s request failed: %s', self.id, type(error).__name__, exc_info=True)
            if isinstance(error, ValueError): message = str(error)
            elif isinstance(getattr(error, 'detail', None), dict): message = error.detail.get('message', '助手操作未完成')
            else: message = '助手操作未完成，请重试'
            try: await self.write({'id': request['id'], 'error': {'code': -32000, 'message': message}})
            except (ValueError, OSError): pass

    def notify(self, method, params):
        if params.get('sessionId') != self.id: return
        with self.factory() as db:
            session = db.get(CanvasAgentSession, self.id)
            if not session or session.lease_owner != self.owner: return
            if method == 'session.event':
                event = params.get('event', {})
                if event.get('type') == 'assistant/message':
                    data = event.get('data', {})
                    content = data.get('content', data.get('message', {}).get('content', []))
                    text = '\n'.join(block.get('text', '') for block in content if block.get('type') == 'text')
                    if text:
                        identity = f"assistant-{event.get('seq')}"
                        if not any(m['id'] == identity for m in session.messages):
                            session.messages = (session.messages + [dict(id=identity, role='assistant', content=text[:30000])])[-200:]
                if event.get('type') == 'turn/end':
                    reason = event.get('data', {}).get('reason', {}).get('kind')
                    if reason not in ['completed', 'interrupted', 'cancelled'] and not self.stopping:
                        session.error = '本次处理未完成，可以补充要求后重试'
            if method == 'session.status':
                if params.get('status') == 'idle':
                    session.status = 'stopped' if self.stopping else 'idle'
                    session.lease_until = 0
                elif params.get('status') == 'running' and not self.stopping:
                    session.status = 'running'; session.lease_until = time.time() + 35
            session.updated_at = time.time(); db.commit()
        self.last_activity = time.time()

    async def pulse(self):
        while not self.stopping:
            await asyncio.sleep(10)
            with self.factory() as db:
                row = db.get(CanvasAgentSession, self.id)
                if not row or row.lease_owner != self.owner: break
                if row.status in ['running', 'waiting_canvas', 'waiting_approval']:
                    row.lease_until = time.time() + 35; db.commit()
                elif time.time() - self.last_activity > 90: break
        if not self.stopping: await self.close()

    async def send(self, text, steer=False):
        self.stopping = False
        self.last_activity = time.time()
        await self.start()
        await self.request('session/steer' if steer else 'session/prompt', {'session_id': self.id, 'text': text})

    async def tool(self, params):
        name = params['name']; args = validate_tool(name, params.get('args', {}))
        call_id = str(params.get('call_id', ''))
        if not call_id or len(call_id) > 200: raise ValueError('操作标识无效')
        with self.factory() as db:
            session = db.get(CanvasAgentSession, self.id)
            self.ensure_owner(db, session)
            if name == 'get_generation':
                task = db.get(Task, args['task_id'])
                if not task or task.user_id != session.user_id or task.project_id != session.project_id: raise ValueError('任务不存在')
                return {key: value for key, value in task_dict(db, task).items() if key in ['id','status','error','result']}
            action = db.scalar(select(CanvasAgentAction).where(CanvasAgentAction.session_id == self.id, CanvasAgentAction.call_id == call_id))
            if action and (action.tool != name or action.arguments != args): raise ValueError('操作标识已用于其他参数，请重新读取画布')
            if not action:
                action = CanvasAgentAction(session_id=self.id, call_id=call_id, tool=name, arguments=args,
                                          status='approval' if name == 'generate_node' else 'pending')
                db.add(action); db.flush()
            identity = action.id
            if action.result is not None: return action.result
            session.status = 'waiting_approval' if action.status == 'approval' else 'waiting_canvas'
            session.lease_until = time.time() + 35
            db.commit()
        # Survives page refresh. A timeout never claims the command was applied.
        deadline = time.monotonic() + 300
        while not self.stopping and time.monotonic() < deadline:
            with self.factory() as db:
                session = db.get(CanvasAgentSession, self.id); self.ensure_owner(db, session)
                action = db.get(CanvasAgentAction, identity)
                if action.result is not None:
                    session.status = 'running'; db.commit(); return action.result
            await asyncio.sleep(0.35)
        with self.factory() as db:
            action = db.get(CanvasAgentAction, identity)
            if action and action.result is None:
                action.status='failed'; action.result={'error':'CANVAS_UNAVAILABLE','message':'画布未连接或操作已停止'}; db.commit()
        raise ValueError('已停止或画布尚未连接，请重新打开当前项目后继续')

    def ensure_owner(self, db, session):
        user = db.get(User, session.user_id) if session else None
        project = db.get(Project, session.project_id) if session else None
        if self.stopping or not session or session.lease_owner != self.owner or not user or not user.active or not project or project.archived:
            raise ValueError('会话已停止或项目不可访问')

    async def model(self, body, *, title_only=False):
        if self.calls >= 32: raise ValueError('本轮处理步骤较多，请确认当前结果后继续')
        self.calls += 1
        if len(json.dumps(body)) > 1500000: raise ValueError('当前画布内容较多，请缩小选区后重试')
        task_id = None
        with self.factory() as db:
            session = db.get(CanvasAgentSession, self.id)
            if not title_only: self.ensure_owner(db, session)
            user = db.get(User, session.user_id)
            payload = dict(project_id=session.project_id, model_offering_id=session.offering_id, operation='text.generate',
                           input={'messages':[{'role':'user','content':'画布助手'}], 'parameters':{}}, source={'kind':'canvas.agent','session_id':self.id})
            offering, sale = validate_task(db, user, payload)
            if offering.adapter != 'openai_chat': raise ValueError('该文字模型尚不支持画布助手')
            channel = db.get(Channel, offering.channel_id)
            secret = resolve_channel_secret(db, channel)
            if not secret: raise ValueError('当前模型暂不可用')
            endpoint = channel.base_url.rstrip('/') + offering.config.get('submit_path', '/v1/chat/completions')
            validate_agent_endpoint(endpoint)
            request = {'model':offering.upstream_model, 'messages':body['messages'], 'tools':body.get('tools', []),
                       'stream':False, **payload['input']['parameters']}
            # A complete graph includes shot content and edges in one atomic call.
            request['max_tokens'] = 64 if title_only else min(int(request.get('max_tokens', 8192)), 8192)
            if 'deepseek' in offering.upstream_model.lower(): request['thinking'] = {'type':'disabled'}
            # Internal trusted tool messages are recorded intact, never accepted by /tasks from arbitrary clients.
            payload['input']['messages'] = body['messages']; payload['input']['tools'] = body.get('tools', [])
            task = Task(user_id=user.id, project_id=session.project_id, offering_id=offering.id,
                idempotency_key='agent-'+str(uuid.uuid4()), fingerprint=fingerprint(payload), payload=payload,
                sale_snapshot=snapshot(sale), offering_snapshot=offering_snapshot(offering), status='agent_running')
            db.add(task); db.flush()
            attempt = Attempt(task_id=task.id, channel_id=channel.id,
                              cost_snapshot=snapshot(current_price(db, offering.id, 'cost')))
            db.add(attempt); db.commit(); task_id = task.id
        try:
            async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
                response = await client.post(endpoint, headers={'Authorization':'Bearer '+secret}, json=request)
            if response.status_code != 200: raise ValueError('文字模型请求失败，请稍后重试')
            data = response.json()
            if not data.get('choices'): raise ValueError('文字模型没有返回有效结果')
            with self.factory() as db:
                task = db.get(Task, task_id); attempt = db.scalar(select(Attempt).where(Attempt.task_id == task_id))
                attempt.response = data
                db.commit()  # Retain provider evidence even if later accounting fails.
                attempt.state = 'succeeded'
                task.status = 'succeeded'; task.finished_at = time.time()
                task.result = {'text': data['choices'][0]['message'].get('content') or ''}
                meters, raw = normalized_usage(task.offering_snapshot, data)
                record_usage(db, task, attempt, meters, raw)
                db.commit()
            if self.stopping: raise ValueError('操作已停止')
            return data
        except BaseException as error:
            with self.factory() as db:
                task = db.get(Task, task_id)
                if task and task.status == 'agent_running':
                    attempt = db.scalar(select(Attempt).where(Attempt.task_id == task_id))
                    if attempt:
                        attempt.response = (attempt.response or {}) | {'agent_error': {'type': type(error).__name__, 'message': sanitized(str(error)[:1000], secret)}}
                    task.status='failed'; task.error='对话请求中断，模型用量待核对'; task.finished_at=time.time(); db.commit()
            raise

    def fail(self, message):
        with self.factory() as db:
            row = db.get(CanvasAgentSession, self.id)
            if row and row.lease_owner == self.owner:
                row.status='interrupted'; row.error=message; row.lease_until=0; db.commit()

    async def close(self):
        self.stopping = True
        with self.factory() as db:
            row = db.get(CanvasAgentSession, self.id)
            if row and row.lease_owner == self.owner:
                if row.status in ['running','waiting_canvas','waiting_approval']:
                    row.status='interrupted'; row.error='连接已中断，重新发送可继续此对话'
                row.lease_owner=None; row.lease_until=0; db.commit()
        if self.process and self.process.returncode is None:
            try: await self.request('shutdown', {}, timeout=2)
            except (ValueError, OSError, asyncio.TimeoutError): pass
            try: await asyncio.wait_for(self.process.wait(), 2)
            except asyncio.TimeoutError:
                self.process.kill(); await self.process.wait()
        for job in list(self.jobs): job.cancel()
        if PROCESSES.get(self.id) is self: PROCESSES.pop(self.id, None)


async def launch(identity, text, engine, steer=False):
    process = PROCESSES.get(identity)
    if not process:
        process = AgentProcess(identity, engine); PROCESSES[identity] = process
    if process.stopping: raise ValueError('正在停止上一轮处理，请稍后继续')
    with process.factory() as db:
        row = db.scalar(select(CanvasAgentSession).where(CanvasAgentSession.id == identity).with_for_update())
        if row.lease_owner not in [None, process.owner] and row.lease_until > time.time():
            raise ValueError('此对话正在其他服务实例运行，请稍后再试')
        if not steer:
            for action in db.scalars(select(CanvasAgentAction).where(CanvasAgentAction.session_id==identity,CanvasAgentAction.result.is_(None))):
                action.status='canceled';action.result={'error':'INTERRUPTED','message':'上轮操作未完成，请重新读取画布'}
        row.lease_owner=process.owner; row.lease_until=time.time()+35; row.status='running'; row.error=None; db.commit()
    try:
        if not steer: process.calls=0
        await process.send(text, steer)
    except Exception:
        process.fail('助手启动失败，请重试或联系管理员检查运行环境')
        await process.close()
        raise
