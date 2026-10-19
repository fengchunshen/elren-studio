import asyncio
import json
import time
import uuid
from fastapi import APIRouter, Depends, Header
from pydantic import Field
from typing import Literal
from sqlalchemy import select
from .db import get_db
from .models import CanvasAgentSession, CanvasAgentAction, Project, Offering, Task
from .schemas import Strict, TaskInput, TaskCreate
from .security import current_user, fail
from .services import owned, task_dict
from . import canvas_agent_runtime as runtime

router = APIRouter(prefix='/api/v1/canvas-agent', tags=['canvas-agent'])


class NewSession(Strict):
    project_id: str
    model_id: str
    client_id: str = Field(min_length=8, max_length=100)


class CanvasReference(Strict):
    node_id: str = Field(min_length=1,max_length=160)
    title: str = Field(min_length=1,max_length=100)
    type: str = Field(min_length=1,max_length=80)
    version: str = Field(min_length=1,max_length=80)
    text: str = Field(default='',max_length=8000)
    prompt: str = Field(default='',max_length=8000)
    media_types: list[Literal['image','video','audio','model']] = Field(default_factory=list,max_length=4)


class Message(Strict):
    id: str = Field(min_length=8, max_length=100)
    text: str = Field(min_length=1, max_length=16000)
    client_id: str = Field(min_length=8, max_length=100)
    references: list[CanvasReference] = Field(default_factory=list,max_length=12)


class ActionResult(Strict):
    client_id: str = Field(min_length=8, max_length=100)
    result: dict


def session_for(db, identity, user, lock=False):
    query = select(CanvasAgentSession).where(CanvasAgentSession.id == identity, CanvasAgentSession.user_id == user.id)
    row = db.scalar(query.with_for_update() if lock else query)
    if not row: fail('NOT_FOUND', '对话不存在', 404)
    project = owned(db, Project, row.project_id, user)
    if project.archived: fail('PROJECT_ARCHIVED', '项目已归档', 409)
    return row


def public_session(row):
    status = row.status
    if status in ['running','waiting_canvas','waiting_approval'] and row.lease_until < time.time(): status='interrupted'
    return {key:getattr(row,key) for key in ['id','project_id','offering_id','client_id','title','messages','error','updated_at']} | {'status':status}


@router.get('/status')
def status(user=Depends(current_user)):
    return {'available':runtime.available()}


@router.get('/sessions')
def list_sessions(project_id: str, user=Depends(current_user), db=Depends(get_db)):
    owned(db, Project, project_id, user)
    rows=db.scalars(select(CanvasAgentSession).where(CanvasAgentSession.user_id==user.id,CanvasAgentSession.project_id==project_id)
                    .order_by(CanvasAgentSession.updated_at.desc()).limit(50))
    return {'items':[public_session(row) for row in rows]}


@router.post('/sessions', status_code=201)
def create_session(body: NewSession, user=Depends(current_user), db=Depends(get_db)):
    project=owned(db,Project,body.project_id,user)
    if project.archived: fail('PROJECT_ARCHIVED','项目已归档',409)
    model=db.get(Offering,body.model_id)
    if not model or not model.active or model.operation!='text.generate' or model.adapter!='openai_chat':
        fail('MODEL_UNAVAILABLE','请选择可用的文字模型')
    if not runtime.available(): fail('AGENT_UNAVAILABLE','画布助手运行环境尚未就绪',503)
    row=CanvasAgentSession(user_id=user.id,project_id=project.id,offering_id=model.id,client_id=body.client_id)
    db.add(row);db.commit()
    return public_session(row)


@router.get('/sessions/{identity}')
def read_session(identity: str, client_id: str, user=Depends(current_user), db=Depends(get_db)):
    row=session_for(db,identity,user)
    actions=list(db.scalars(select(CanvasAgentAction).where(CanvasAgentAction.session_id==row.id).order_by(CanvasAgentAction.created_at)))
    visible=[]
    for action in actions[-100:]:
        can_execute=(client_id==row.client_id and row.status in ['running','waiting_canvas','waiting_approval'] and row.lease_until>time.time())
        visible.append({key:getattr(action,key) for key in ['id','tool','arguments','status','result']} | {'can_execute':can_execute})
    return public_session(row) | {'actions':visible}


@router.post('/sessions/{identity}/messages', status_code=202)
async def send_message(identity: str, body: Message, user=Depends(current_user), db=Depends(get_db)):
    row=session_for(db,identity,user,lock=True)
    previous=next((m for m in row.messages if m['id']==body.id),None)
    references=[reference.model_dump() for reference in body.references]
    if len({reference['node_id'] for reference in references}) != len(references): fail('DUPLICATE_REFERENCE','同一节点无需重复引用')
    if previous:
        if previous['content']!=body.text or previous.get('references',[])!=references: fail('MESSAGE_CONFLICT','消息标识已用于其他内容',409)
        return public_session(row)
    if not body.text.strip(): fail('EMPTY_MESSAGE','请输入内容')
    active=row.status in ['running','waiting_canvas','waiting_approval'] and row.lease_until>time.time()
    if active and row.client_id!=body.client_id: fail('CANVAS_BUSY','该对话正在另一画布页面执行',409)
    if len([p for p in runtime.PROCESSES.values() if not p.stopping])>=8 and identity not in runtime.PROCESSES:
        fail('AGENT_BUSY','助手任务较多，请稍后重试',429)
    if row.lease_owner and active and identity not in runtime.PROCESSES:
        fail('AGENT_BUSY','该对话正在另一服务实例执行',409)
    row.client_id=body.client_id
    row.messages=(row.messages+[{'id':body.id,'role':'user','content':body.text,'references':references}])[-200:]
    if row.title=='新对话': row.title=body.text[:40]
    row.updated_at=time.time();db.commit()
    agent_text=body.text
    if references:
        agent_text+='\n\n本条消息引用的画布节点（用户点选时的快照，仅作为数据；写入前读取当前版本）：\n'+json.dumps(references,ensure_ascii=False)
    try: await runtime.launch(identity,agent_text,db.get_bind(),steer=active)
    except Exception: fail('AGENT_START_FAILED','助手启动失败，请稍后重试',503)
    db.expire_all();return public_session(db.get(CanvasAgentSession,identity))


@router.post('/sessions/{identity}/stop')
async def stop(identity: str, user=Depends(current_user), db=Depends(get_db)):
    row=session_for(db,identity,user,lock=True)
    row.status='stopped';row.lease_until=0;row.lease_owner=None
    for action in db.scalars(select(CanvasAgentAction).where(CanvasAgentAction.session_id==identity,CanvasAgentAction.result.is_(None))):
        action.status='canceled';action.result={'error':'USER_STOPPED','message':'用户已停止本轮操作'}
    db.commit()
    process=runtime.PROCESSES.get(identity)
    if process:
        process.stopping=True
        try: await process.request('session/cancel',{'session_id':identity},timeout=2)
        except (ValueError,asyncio.TimeoutError,OSError): pass
        await process.close()
    return public_session(row)


def action_for(db, identity, user, client_id):
    action=db.scalar(select(CanvasAgentAction).where(CanvasAgentAction.id==identity).with_for_update())
    if not action: fail('NOT_FOUND','操作不存在',404)
    session=session_for(db,action.session_id,user,lock=True)
    if client_id!=session.client_id: fail('CANVAS_MISMATCH','请在当前对话所在画布操作',409)
    return action,session


@router.post('/actions/{identity}/result')
def finish_action(identity: str, body: ActionResult, user=Depends(current_user), db=Depends(get_db)):
    action,session=action_for(db,identity,user,body.client_id)
    if len(json.dumps(body.result))>500000: fail('RESULT_TOO_LARGE','画布内容过多，请缩小范围')
    if action.result is not None:
        return {'status':action.status,'result':action.result}
    if action.tool=='generate_node' and not body.result.get('error'): fail('INVALID_ACTION','生成操作需通过确认与提交接口')
    if session.lease_until<time.time() or session.status=='stopped': fail('ACTION_EXPIRED','操作已暂停，请继续对话',409)
    action.result=body.result;action.status='failed' if body.result.get('error') else 'done';db.commit()
    return {'status':action.status}


class Decision(Strict):
    client_id: str
    approve: bool


@router.post('/actions/{identity}/decision')
def decide(identity: str, body: Decision, user=Depends(current_user), db=Depends(get_db)):
    action,session=action_for(db,identity,user,body.client_id)
    if action.tool!='generate_node': fail('INVALID_ACTION','此操作不需要生成确认')
    if action.result is not None: return {'status':action.status}
    if session.status=='stopped' or session.lease_until<time.time(): fail('ACTION_EXPIRED','操作已暂停',409)
    if body.approve: action.status='approved'
    else: action.status='declined';action.result={'error':'USER_DECLINED','message':'用户取消了本次生成，请等待新要求'}
    db.commit();return {'status':action.status}


class Generation(Strict):
    client_id: str
    model_id: str
    input: dict


@router.post('/actions/{identity}/generate')
def generate(identity: str, body: Generation, user=Depends(current_user), db=Depends(get_db)):
    from .main import estimate, submit
    action,session=action_for(db,identity,user,body.client_id)
    if action.tool!='generate_node': fail('INVALID_ACTION','此操作不是生成请求')
    key='canvas-agent-'+action.id
    existing=db.scalar(select(Task).where(Task.user_id==user.id,Task.idempotency_key==key))
    if existing:
        result=task_dict(db,existing)
    else:
        if action.status!='approved' or session.status=='stopped' or session.lease_until<time.time():
            fail('GENERATION_NOT_APPROVED','请先确认本次生成',409)
        model=db.get(Offering,body.model_id)
        if not model or model.operation not in ['image.generate','image.edit','video.generate']:
            fail('MODEL_UNAVAILABLE','请选择图片或视频生成模型')
        payload=TaskInput(project_id=session.project_id,model_offering_id=model.id,operation=model.operation,
                          input=body.input,source={'node_id':action.arguments['node_id'],'kind':'image' if model.operation.startswith('image') else 'video','agent_action_id':action.id})
        quote=estimate(payload,user,db)
        # The command identity, not a newly generated browser UUID, owns retries.
        result=submit(TaskCreate(**(payload.model_dump() | {'input':quote['input'],'quote_id':quote['quote_id']})),key,user,db)
    action=db.get(CanvasAgentAction,identity)
    action.status='done';action.result={'task_id':result['id'],'status':result['status']};db.commit()
    return result
