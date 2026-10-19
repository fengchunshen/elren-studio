import secrets
import time
from decimal import Decimal
from fastapi import FastAPI, Depends, Request, Response, UploadFile, File, Form, Header, Query
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select, delete, func, or_, and_
from sqlalchemy.exc import IntegrityError
from .config import settings
from .db import get_db
from .models import User, LoginSession, LoginHit, Project, Channel, Offering, Price, Quote, Task, Attempt, Entry, Asset, Audit
from .schemas import Credentials, NewUser, UserPatch, PasswordChange, ProjectInput, ChannelInput, OfferingInput, PriceInput, TaskInput, TaskCreate, Adjustment, Reconcile
from .security import current_user, admin, check_origin, digest, passwords, verify_password, DUMMY_HASH, fail, user_dict, audit, validate_channel
from .pricing import current_price, snapshot, fingerprint, validate_price, calculate, decimal
from .services import owned, validate_offering, validate_task, offering_snapshot, task_dict, record_usage
from .assets import save_asset, asset_dict
from .presets import presets
from .models import MediaJob
from .schemas import MediaRenderInput
from .media_processing import validate_clips, job_dict
from .schemas import ChannelTestInput
from .channel_credentials import channel_dict, key_value, resolve_channel_secret, save_channel_secret
from .channel_probe import probe_channel

app = FastAPI(title="Elren Studio Platform", version="0.1.0")
PREFIX = "/api/v1"
from .canvas_agent_api import router as canvas_agent_router
app.include_router(canvas_agent_router)


@app.on_event('shutdown')
async def close_canvas_agents():
    import asyncio
    from .canvas_agent_runtime import PROCESSES
    await asyncio.gather(*(process.close() for process in list(PROCESSES.values())), return_exceptions=True)


@app.post(PREFIX + "/media-jobs")
def create_media_job(body: MediaRenderInput, user=Depends(current_user), db=Depends(get_db), idempotency_key: str = Header(alias="Idempotency-Key")):
    if not 1 <= len(idempotency_key) <= 200:
        raise ValueError("请求标识无效")
    project = owned(db, Project, body.project_id, user)
    if project.archived:
        raise ValueError("项目已归档")
    payload = validate_clips(db, user.id, project.id, body.clips, body.width, body.height)
    payload["operation"] = body.operation
    if body.operation == "scene_split" and len(body.clips) != 1:
        raise ValueError("智能剪辑每次处理一个源视频")
    previous = db.scalar(select(MediaJob).where(MediaJob.user_id == user.id, MediaJob.request_key == idempotency_key))
    if previous:
        if previous.project_id != project.id or previous.payload != payload:
            raise ValueError("相同请求标识不能用于不同时间线")
        return job_dict(previous)
    job = MediaJob(user_id=user.id, project_id=project.id, payload=payload, request_key=idempotency_key)
    db.add(job)
    db.commit()
    return job_dict(job)


@app.get(PREFIX + "/media-jobs/{identity}")
def get_media_job(identity: str, user=Depends(current_user), db=Depends(get_db)):
    return job_dict(owned(db, MediaJob, identity, user))


@app.post(PREFIX + "/media-jobs/{identity}/cancel")
def cancel_media_job(identity: str, user=Depends(current_user), db=Depends(get_db)):
    job = owned(db, MediaJob, identity, user)
    if job.status in {"queued", "running"}:
        job.status = "canceled"
        db.commit()
    return job_dict(job)


@app.exception_handler(ValueError)
async def value_error(request, error):
    return JSONResponse(status_code=400, content={"detail": {"code": "INVALID_INPUT", "message": str(error)}})


@app.exception_handler(RequestValidationError)
async def request_validation_error(request, error):
    # Pydantic's default response echoes submitted input, including credentials.
    return JSONResponse(status_code=422, content={"detail": {
        "code": "INVALID_INPUT", "message": "提交的字段格式不正确，请检查后重试。"}})


@app.exception_handler(IntegrityError)
async def conflict(request, error):
    return JSONResponse(status_code=409, content={"detail": {"code": "CONFLICT", "message": "记录已存在，请刷新后重试"}})


@app.middleware("http")
async def headers(request, call_next):
    length = request.headers.get("content-length", "0")
    if length.isdigit() and int(length) > settings.max_upload_bytes + 1024 * 1024:
        return JSONResponse(status_code=413, content={"detail": "请求过大"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get(PREFIX + "/health")
def health(db=Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok"}


@app.post(PREFIX + "/auth/login")
def login(body: Credentials, request: Request, response: Response, db=Depends(get_db)):
    check_origin(request)
    key = digest(f"{request.client.host}:{body.username.lower()}")
    ip_key = digest(f"ip:{request.client.host}")
    for bucket, maximum in ((key, 10), (ip_key, 50)):
        count = db.scalar(select(func.count()).select_from(LoginHit).where(LoginHit.key == bucket, LoginHit.created_at > time.time() - 300))
        if count >= maximum:
            fail("LOGIN_RATE_LIMIT", "登录尝试过于频繁，请稍后再试", 429)
        db.add(LoginHit(key=bucket))
    db.execute(delete(LoginHit).where(LoginHit.created_at < time.time() - 3600))
    db.commit()
    user = db.scalar(select(User).where(User.username == body.username.strip().lower()))
    valid = verify_password(user.password_hash if user else DUMMY_HASH, body.password)
    if not user or not valid or not user.active:
        fail("LOGIN_FAILED", "账号或密码不正确", 401)
    old = request.cookies.get(settings.session_cookie)
    if old:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(old)))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(LoginSession(user_id=user.id, token_hash=digest(token), csrf=csrf, expires_at=time.time() + settings.session_seconds))
    db.commit()
    response.set_cookie(settings.session_cookie, token, httponly=True, secure=settings.cookie_secure,
                        samesite="lax", max_age=settings.session_seconds, path="/")
    return {"user": user_dict(user), "csrf_token": csrf}


@app.get(PREFIX + "/auth/me")
def me(request: Request, user=Depends(current_user)):
    return {"user": user_dict(user), "csrf_token": request.state.session.csrf}


@app.post(PREFIX + "/auth/logout")
def logout(request: Request, response: Response, user=Depends(current_user), db=Depends(get_db)):
    db.delete(request.state.session)
    db.commit()
    response.delete_cookie(settings.session_cookie, path="/")
    return {"ok": True}


@app.post(PREFIX + "/auth/change-password")
def change_password(body: PasswordChange, response: Response, user=Depends(current_user), db=Depends(get_db)):
    if not verify_password(user.password_hash, body.current_password):
        fail("PASSWORD_MISMATCH", "当前密码不正确")
    user.password_hash = passwords.hash(body.password)
    user.must_change_password = False
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    audit(db, user, "password.change", user.id)
    db.commit()
    response.delete_cookie(settings.session_cookie, path="/")
    return {"ok": True, "login_required": True}


def row(item):
    return {column.name: getattr(item, column.name) for column in item.__table__.columns}


def page(db, statement, model, cursor, limit):
    if cursor:
        previous = db.get(model, cursor)
        if previous:
            statement = statement.where(or_(model.created_at < previous.created_at,
                                         and_(model.created_at == previous.created_at, model.id < previous.id)))
    items = list(db.scalars(statement.order_by(model.created_at.desc(), model.id.desc()).limit(limit + 1)))
    return items[:limit], items[limit - 1].id if len(items) > limit else None


@app.get(PREFIX + "/projects")
def projects(user=Depends(current_user), db=Depends(get_db)):
    items = list(db.scalars(select(Project).where(Project.user_id == user.id).order_by(Project.created_at)))
    return {"items": [row(p) for p in items]}


@app.post(PREFIX + "/projects")
def create_project(body: ProjectInput, user=Depends(current_user), db=Depends(get_db)):
    project = Project(user_id=user.id, **body.model_dump())
    db.add(project)
    db.commit()
    return row(project)


@app.patch(PREFIX + "/projects/{identity}")
def update_project(identity: str, body: ProjectInput, user=Depends(current_user), db=Depends(get_db)):
    project = owned(db, Project, identity, user)
    project.name, project.archived = body.name, body.archived
    db.commit()
    return row(project)


@app.get(PREFIX + "/models")
def models(user=Depends(current_user), db=Depends(get_db)):
    result = []
    for offering in db.scalars(select(Offering).join(Channel).where(Offering.active.is_(True), Channel.active.is_(True)).order_by(Offering.created_at, Offering.id)):
        sale, cost = current_price(db, offering.id, "sale"), current_price(db, offering.id, "cost")
        if not sale or not cost:
            continue
        components = [{**component, "unit_price": str(decimal(component["unit_price"]) * (1 + decimal(sale.markup)) * decimal(sale.fx))} for component in sale.components]
        result.append({"id": offering.id, "name": offering.name, "operation": offering.operation,
                       "tags": offering.config.get("display_tags", []), "description": offering.config.get("display_description", ""),
                       "parameters": offering.parameters,
                       "inputs": {"types": offering.config.get("accepted_media", ["audio"] if offering.operation == "audio.generate" else ["image"]),
                                  "max": min(50, int(offering.config.get("max_assets", 20))), "limits": offering.config.get("reference_limits", {}),
                                  "frames": bool(offering.config.get("content_from_frames") or offering.adapter == "minimax_h3"), "shots": bool(offering.config.get("supports_shots")), "videoEdit": offering.config.get("video_edit_contract"), "audioPurpose": offering.config.get("audio_purpose")},
                       "price": {"id": sale.id, "currency": sale.display_currency, "components": components}})
    return {"items": result}


@app.post(PREFIX + "/pricing/estimate")
def estimate(body: TaskInput, user=Depends(current_user), db=Depends(get_db)):
    payload = body.model_dump()
    offering, sale = validate_task(db, user, payload)
    price = snapshot(sale)
    parameters = payload["input"]["parameters"]
    meters = {"requests": "1"}
    if offering.operation.startswith("image"):
        meters["images"] = str(parameters.get("n", parameters.get("count", 1)))
    if offering.config.get("ark_image_billing") == "seedream_5_pro_single":
        from .ark import seedream_estimate
        meters.update(seedream_estimate(payload["input"]))
    if offering.operation == "video.generate" and "duration" in parameters:
        meters["video_seconds"] = str(parameters["duration"])
    result = calculate(price, meters, parameters)
    quote = Quote(user_id=user.id, fingerprint=fingerprint(payload), snapshot=price, expires_at=time.time() + 300)
    db.add(quote)
    db.commit()
    return {"quote_id": quote.id, "expires_at": quote.expires_at, "currency": price["display_currency"],
            "amount": str(result["amount"]) if result else None, "estimate_type": "estimated" if result else "unknown",
            "price_version_id": sale.id, "input": payload["input"]}


def submit(body, key, user, db, test=False):
    if not key or not 8 <= len(key) <= 100:
        fail("IDEMPOTENCY_REQUIRED", "需要有效的 Idempotency-Key")
    # Serialize submissions per user to enforce admission limits and deduplicate concurrently.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    payload = body.model_dump(exclude={"quote_id"})
    previous = db.scalar(select(Task).where(Task.user_id == user.id, Task.idempotency_key == key))
    if previous:
        parameters = payload["input"].setdefault("parameters", {})
        for name, spec in previous.offering_snapshot["parameters"].items():
            if name not in parameters and "default" in spec:
                parameters[name] = spec["default"]
        if previous.fingerprint != fingerprint(payload) or previous.test != test:
            fail("IDEMPOTENCY_CONFLICT", "该请求标识已用于其他参数", 409)
        return task_dict(db, previous)
    offering, sale = validate_task(db, user, payload)
    quote = db.get(Quote, body.quote_id)
    if not quote or quote.user_id != user.id or quote.expires_at < time.time():
        fail("QUOTE_EXPIRED", "费用估算已过期，请重新估算", 409)
    if quote.fingerprint != fingerprint(payload):
        fail("QUOTE_MISMATCH", "请求参数已变化，请重新估算", 409)
    active = db.scalar(select(func.count()).select_from(Task).where(Task.user_id == user.id, Task.status.in_(["queued", "submitting", "running", "reconciling"])))
    recent = db.scalar(select(func.count()).select_from(Task).where(Task.user_id == user.id, Task.created_at > time.time() - 60))
    if active >= settings.max_pending_per_user or recent >= 60:
        fail("TASK_RATE_LIMIT", "任务较多，请等待已有任务完成", 429)
    task = Task(user_id=user.id, project_id=body.project_id, offering_id=offering.id, idempotency_key=key,
                fingerprint=fingerprint(payload), payload=payload, sale_snapshot=quote.snapshot,
                offering_snapshot=offering_snapshot(offering), test=test)
    db.add(task)
    db.flush()
    if test:
        audit(db, user, "model.test", task.id)
    db.commit()
    return task_dict(db, task)


@app.post(PREFIX + "/tasks", status_code=202)
def create_task(body: TaskCreate, idempotency_key: str | None = Header(default=None), user=Depends(current_user), db=Depends(get_db)):
    return submit(body, idempotency_key, user, db)


@app.get(PREFIX + "/tasks")
def list_tasks(project_id: str | None = None, cursor: str | None = None, limit: int = Query(50, ge=1, le=100), user=Depends(current_user), db=Depends(get_db)):
    query = select(Task).where(Task.user_id == user.id)
    if project_id:
        query = query.where(Task.project_id == project_id)
    items, next_cursor = page(db, query, Task, cursor, limit)
    return {"items": [task_dict(db, task) for task in items], "next_cursor": next_cursor}


@app.get(PREFIX + "/tasks/{identity}")
def read_task(identity: str, user=Depends(current_user), db=Depends(get_db)):
    return task_dict(db, owned(db, Task, identity, user))


@app.post(PREFIX + "/tasks/{identity}/cancel")
def cancel(identity: str, user=Depends(current_user), db=Depends(get_db)):
    task = db.scalar(select(Task).where(Task.id == identity, Task.user_id == user.id).with_for_update())
    if not task:
        fail("NOT_FOUND", "任务不存在", 404)
    if task.status == "queued":
        task.status, task.billing_status, task.cost_status = "canceled", "not_billable", "not_incurred"
        task.finished_at = time.time()
    elif task.status in {"submitting", "running", "reconciling"}:
        fail("CANCEL_UNSUPPORTED", "任务已提交；当前渠道不支持可靠取消，将继续获取结果", 409)
    db.commit()
    return task_dict(db, task)


@app.post(PREFIX + "/assets")
async def upload(project_id: str = Form(), file: UploadFile = File(), user=Depends(current_user), db=Depends(get_db)):
    owned(db, Project, project_id, user)
    data = await file.read(settings.max_upload_bytes + 1)
    asset = save_asset(db, user.id, project_id, data, file.content_type or "", file.filename or "asset")
    db.commit()
    return asset_dict(asset)


@app.get(PREFIX + "/assets/{identity}/content")
def content(identity: str, user=Depends(current_user), db=Depends(get_db)):
    asset = owned(db, Asset, identity, user)
    return FileResponse(settings.asset_dir / asset.storage_key, media_type=asset.mime)


def usage_query(user_id, project_id, model_id, start, end):
    query = select(Task)
    for value, column in ((user_id, Task.user_id), (project_id, Task.project_id), (model_id, Task.offering_id)):
        if value:
            query = query.where(column == value)
    if start is not None:
        query = query.where(Task.created_at >= start)
    if end is not None:
        query = query.where(Task.created_at < end)
    return query


def summary(db, query, management=False):
    tasks = query.with_only_columns(Task.id).subquery()
    amounts = dict(db.execute(select(Entry.kind, func.sum(Entry.amount)).where(Entry.task_id.in_(select(tasks.c.id))).group_by(Entry.kind)).all())
    pending = db.scalar(select(func.count()).select_from(Task).where(Task.id.in_(select(tasks.c.id)), Task.billing_status == "pending"))
    total = db.scalar(select(func.count()).select_from(tasks))
    not_billable = db.scalar(select(func.count()).select_from(Task).where(Task.id.in_(select(tasks.c.id)), Task.billing_status == "not_billable"))
    result = {"currency": "CNY", "recorded_amount": str(amounts.get("sale", Decimal(0))), "pending_count": pending,
              "task_count": total, "not_billable_count": not_billable, "generated_at": time.time()}
    if management:
        cost_pending = db.scalar(select(func.count()).select_from(Task).where(Task.id.in_(select(tasks.c.id)), Task.cost_status == "pending"))
        result.update(cost_amount=str(amounts.get("cost", Decimal(0))), cost_pending_count=cost_pending,
                      difference=str(amounts.get("sale", Decimal(0)) - amounts.get("cost", Decimal(0))), incomplete=bool(pending or cost_pending))
    return result


@app.get(PREFIX + "/usage/summary")
def usage_summary(project_id: str | None = None, model_id: str | None = None, start: float | None = None, end: float | None = None, user=Depends(current_user), db=Depends(get_db)):
    return summary(db, usage_query(user.id, project_id, model_id, start, end))


@app.get(PREFIX + "/usage/records")
def usage_records(project_id: str | None = None, model_id: str | None = None, start: float | None = None, end: float | None = None, cursor: str | None = None, limit: int = Query(50, ge=1, le=100), user=Depends(current_user), db=Depends(get_db)):
    items, next_cursor = page(db, usage_query(user.id, project_id, model_id, start, end), Task, cursor, limit)
    return {"items": [task_dict(db, task) for task in items], "next_cursor": next_cursor}


@app.get(PREFIX + "/admin/users")
def users(cursor: str | None = None, limit: int = Query(50, ge=1, le=100), user=Depends(admin), db=Depends(get_db)):
    items, next_cursor = page(db, select(User), User, cursor, limit)
    return {"items": [user_dict(item) for item in items], "next_cursor": next_cursor}


@app.post(PREFIX + "/admin/users")
def create_user(body: NewUser, user=Depends(admin), db=Depends(get_db)):
    if len(body.password) < 12:
        raise ValueError("初始密码至少 12 位")
    created = User(username=body.username.strip().lower(), password_hash=passwords.hash(body.password), role=body.role)
    db.add(created)
    db.flush()
    db.add(Project(user_id=created.id, name="默认项目"))
    audit(db, user, "user.create", created.id)
    db.commit()
    return user_dict(created)


@app.patch(PREFIX + "/admin/users/{identity}")
def update_user(identity: str, body: UserPatch, user=Depends(admin), db=Depends(get_db)):
    target = db.get(User, identity)
    if not target:
        fail("NOT_FOUND", "用户不存在", 404)
    if identity == user.id and (body.active is False or body.role == "user"):
        fail("SELF_LOCKOUT", "不能停用或降级当前管理员")
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(target, key, value)
    db.execute(delete(LoginSession).where(LoginSession.user_id == identity))
    audit(db, user, "user.update", identity, body.model_dump(exclude_none=True))
    db.commit()
    return user_dict(target)


@app.post(PREFIX + "/admin/users/{identity}/reset-password")
def reset_password(identity: str, user=Depends(admin), db=Depends(get_db)):
    target = db.get(User, identity)
    if not target:
        fail("NOT_FOUND", "用户不存在", 404)
    password = secrets.token_urlsafe(18)
    target.password_hash, target.must_change_password = passwords.hash(password), True
    db.execute(delete(LoginSession).where(LoginSession.user_id == identity))
    audit(db, user, "user.reset_password", identity)
    db.commit()
    return {"temporary_password": password}


@app.get(PREFIX + "/admin/channels")
def channels(user=Depends(admin), db=Depends(get_db)):
    return {"items": [channel_dict(db, item) for item in db.scalars(select(Channel).order_by(Channel.created_at))]}


@app.get(PREFIX + "/admin/model-presets")
def model_presets(user=Depends(admin)):
    return {"items": presets()}


@app.post(PREFIX + "/admin/model-presets/{identity}")
def import_preset(identity: str, user=Depends(admin), db=Depends(get_db)):
    preset = next((item for item in presets() if item["id"] == identity), None)
    if not preset:
        fail("NOT_FOUND", "预设不存在", 404)
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    existing = next((model for model in db.scalars(select(Offering)) if model.config.get("preset_id") == identity), None)
    if existing:
        return {"model_id": existing.id, "created": False}
    channel = db.scalar(select(Channel).where(Channel.base_url == preset["channel"]["base_url"], Channel.key_env == preset["channel"]["key_env"]).limit(1))
    if not channel:
        channel = Channel(**preset["channel"])
        db.add(channel); db.flush()
    values = preset["offering"]
    validate_offering(values)
    values["config"]["preset_id"] = identity
    offering = Offering(**values, channel_id=channel.id, active=False)
    db.add(offering); db.flush()
    if preset["reference_price"]:
        for kind in ("sale", "cost"):
            db.add(Price(offering_id=offering.id, kind=kind, display_currency="CNY", markup=preset.get("sale_markup", "0.20") if kind == "sale" else "0",
                         **preset["reference_price"]))
    audit(db, user, "preset.import", offering.id, {"preset_id": identity})
    db.commit()
    return {"model_id": offering.id, "created": True, "prices_published": False}



@app.post(PREFIX + "/admin/channels")
def create_channel(body: ChannelInput, user=Depends(admin), db=Depends(get_db)):
    values = body.model_dump(exclude={'api_key'})
    values['key_env'] = body.key_env or 'ELREN_PROVIDER_' + secrets.token_hex(12).upper()
    secret = key_value(body.api_key)
    validate_channel(values)
    channel = Channel(**values)
    db.add(channel)
    db.flush()
    changed = save_channel_secret(db, channel, secret)
    audit(db, user, "channel.create", channel.id, {'credential_updated': changed})
    db.commit()
    return channel_dict(db, channel)


@app.post(PREFIX + "/admin/channels/test")
def test_channel(body: ChannelTestInput, user=Depends(admin), db=Depends(get_db)):
    secret = key_value(body.api_key)
    if body.channel_id:
        channel = db.get(Channel, body.channel_id)
        if not channel:
            fail('NOT_FOUND', '渠道不存在', 404)
        if not secret:
            if body.base_url.rstrip('/') != channel.base_url.rstrip('/'):
                raise ValueError('更换 API 地址后，请重新填写该地址的 API Key 再测试')
            secret = resolve_channel_secret(db, channel)
    result = probe_channel(body.base_url, secret)
    audit(db, user, 'channel.test', body.channel_id or 'unsaved', {'ok': result['ok']})
    db.commit()
    return result


@app.patch(PREFIX + "/admin/channels/{identity}")
def update_channel(identity: str, body: ChannelInput, user=Depends(admin), db=Depends(get_db)):
    channel = db.scalar(select(Channel).where(Channel.id == identity).with_for_update())
    if not channel:
        fail("NOT_FOUND", "渠道不存在", 404)
    values = body.model_dump(exclude={'api_key'})
    values['key_env'] = body.key_env or channel.key_env
    secret = key_value(body.api_key)
    validate_channel(values)
    if (body.base_url != channel.base_url or values['key_env'] != channel.key_env) and db.scalar(select(Attempt.id).where(Attempt.channel_id == identity).limit(1)):
        raise ValueError("该渠道已有任务，更换地址或凭据引用请创建新渠道")
    if body.base_url.rstrip('/') != channel.base_url.rstrip('/') and not secret and resolve_channel_secret(db, channel):
        raise ValueError('更换 API 地址时，请同时填写该地址的 API Key')
    for key, value in values.items():
        setattr(channel, key, value)
    changed = save_channel_secret(db, channel, secret)
    audit(db, user, "channel.update", identity, {"active": body.active, 'credential_updated': changed})
    db.commit()
    return channel_dict(db, channel)


@app.get(PREFIX + "/admin/models")
def admin_models(user=Depends(admin), db=Depends(get_db)):
    return {"items": [row(item) for item in db.scalars(select(Offering).order_by(Offering.created_at))]}


@app.post(PREFIX + "/admin/models")
def create_model(body: OfferingInput, user=Depends(admin), db=Depends(get_db)):
    validate_offering(body.model_dump())
    if not db.get(Channel, body.channel_id):
        raise ValueError("渠道不存在")
    model = Offering(**body.model_dump())
    db.add(model)
    db.flush()
    audit(db, user, "model.create", model.id)
    db.commit()
    return row(model)


@app.patch(PREFIX + "/admin/models/{identity}")
def update_model(identity: str, body: OfferingInput, user=Depends(admin), db=Depends(get_db)):
    model = db.get(Offering, identity)
    if not model:
        fail("NOT_FOUND", "模型不存在", 404)
    validate_offering(body.model_dump())
    if body.channel_id != model.channel_id or body.operation != model.operation or body.upstream_model != model.upstream_model:
        raise ValueError("更换渠道、上游模型或能力请创建新条目，保留旧记录语义")
    for key, value in body.model_dump().items():
        setattr(model, key, value)
    audit(db, user, "model.update", identity)
    db.commit()
    return row(model)


@app.get(PREFIX + "/admin/price-versions")
def prices(user=Depends(admin), db=Depends(get_db)):
    return {"items": [row(item) for item in db.scalars(select(Price).order_by(Price.created_at.desc()))]}


@app.post(PREFIX + "/admin/price-versions")
def create_price(body: PriceInput, user=Depends(admin), db=Depends(get_db)):
    validate_price(body.model_dump())
    if not db.get(Offering, body.offering_id):
        raise ValueError("模型不存在")
    price = Price(**body.model_dump())
    db.add(price)
    db.flush()
    audit(db, user, "price.create", price.id)
    db.commit()
    return row(price)


@app.post(PREFIX + "/admin/price-versions/{identity}/publish")
def publish_price(identity: str, user=Depends(admin), db=Depends(get_db)):
    price = db.scalar(select(Price).where(Price.id == identity).with_for_update())
    if not price:
        fail("NOT_FOUND", "价格不存在", 404)
    if price.published_at is None:
        price.published_at = time.time()
        audit(db, user, "price.publish", identity)
    db.commit()
    return row(price)


@app.post(PREFIX + "/admin/models/{identity}/test", status_code=202)
def test_model(identity: str, body: TaskCreate, idempotency_key: str | None = Header(default=None), user=Depends(admin), db=Depends(get_db)):
    if identity != body.model_offering_id:
        raise ValueError("模型 ID 不匹配")
    return submit(body, idempotency_key, user, db, test=True)


@app.get(PREFIX + "/admin/usage/summary")
def admin_summary(user_id: str | None = None, project_id: str | None = None, model_id: str | None = None, start: float | None = None, end: float | None = None, user=Depends(admin), db=Depends(get_db)):
    audit(db, user, "usage.read", "summary")
    result = summary(db, usage_query(user_id, project_id, model_id, start, end), True)
    db.commit()
    return result


@app.get(PREFIX + "/admin/usage/records")
def admin_records(user_id: str | None = None, project_id: str | None = None, model_id: str | None = None, start: float | None = None, end: float | None = None, cursor: str | None = None, limit: int = Query(50, ge=1, le=100), user=Depends(admin), db=Depends(get_db)):
    items, next_cursor = page(db, usage_query(user_id, project_id, model_id, start, end), Task, cursor, limit)
    audit(db, user, "usage.read", "records")
    result = {"items": [task_dict(db, task, True) for task in items], "next_cursor": next_cursor}
    db.commit()
    return result


@app.post(PREFIX + "/admin/tasks/{identity}/reconcile")
def reconcile(identity: str, body: Reconcile, user=Depends(admin), db=Depends(get_db)):
    task = db.scalar(select(Task).where(Task.id == identity).with_for_update())
    if not task:
        fail("NOT_FOUND", "任务不存在", 404)
    if task.lease_until > time.time():
        fail("TASK_BUSY", "任务正在处理，请稍后核对", 409)
    attempt = db.scalar(select(Attempt).where(Attempt.task_id == task.id))
    if not attempt:
        raise ValueError("任务尚未提交")
    if body.remote_id:
        if attempt.remote_id and attempt.remote_id != body.remote_id:
            raise ValueError("不可替换已记录的上游任务 ID")
        attempt.remote_id = body.remote_id
        task.status, task.next_at = "reconciling", 0
    if body.outcome == "failed":
        if task.status not in {"reconciling", "failed"}:
            raise ValueError("只能将待核对任务确认为失败")
        task.status, task.billing_status, task.finished_at = "failed", "not_billable", time.time()
        task.error = "已根据供应商证据确认任务失败"
    if body.meters is not None:
        if task.status not in {"succeeded", "partially_succeeded", "failed"}:
            raise ValueError("请先核对任务执行结果")
        for value in body.meters.values():
            if decimal(value) < 0:
                raise ValueError("用量不能为负")
        record_usage(db, task, attempt, body.meters, {"reference": body.evidence_reference}, "admin_reconciliation", task.status != "failed")
    audit(db, user, "task.reconcile", identity, body.model_dump())
    db.commit()
    return task_dict(db, task, True)


@app.post(PREFIX + "/admin/charge-adjustments")
def adjustment(body: Adjustment, idempotency_key: str = Header(), user=Depends(admin), db=Depends(get_db)):
    if not 8 <= len(idempotency_key) <= 100:
        raise ValueError("调整请求标识格式不正确")
    original = db.get(Entry, body.original_entry_id)
    if not original:
        fail("NOT_FOUND", "原始分录不存在", 404)
    key = f"adjustment:{user.id}:{idempotency_key}"
    existing = db.scalar(select(Entry).where(Entry.entry_key == key))
    if existing:
        if existing.original_entry_id != original.id or existing.amount != decimal(body.amount) or existing.reason != body.reason:
            fail("IDEMPOTENCY_CONFLICT", "调整标识已用于其他参数", 409)
        return {"id": existing.id}
    amount = decimal(body.amount)
    entry = Entry(entry_key=key, task_id=original.task_id, user_id=original.user_id, project_id=original.project_id,
                  kind=original.kind, currency="CNY", display_currency="CNY", original_amount=amount, amount=amount,
                  details={"actor_id": user.id}, original_entry_id=original.id, reason=body.reason)
    db.add(entry)
    db.flush()
    audit(db, user, "charge.adjust", entry.id, body.model_dump())
    db.commit()
    return {"id": entry.id}


@app.get(PREFIX + "/admin/audit-events")
def audit_events(cursor: str | None = None, limit: int = Query(50, ge=1, le=100), user=Depends(admin), db=Depends(get_db)):
    items, next_cursor = page(db, select(Audit), Audit, cursor, limit)
    return {"items": [row(item) for item in items], "next_cursor": next_cursor}
