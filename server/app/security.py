import hashlib
import hmac
import ipaddress
import os
import re
import secrets
import socket
import time
from urllib.parse import urlsplit
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from .config import settings
from .db import get_db
from .models import LoginSession, User, Audit

passwords = PasswordHasher()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))


def fail(code, message, status=400):
    raise HTTPException(status, {"code": code, "message": message})


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def verify_password(encoded, password):
    try:
        return passwords.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False


def check_origin(request):
    if request.headers.get("origin") != settings.public_origin:
        fail("ORIGIN_REJECTED", "请求来源不正确", 403)


def user_dict(user):
    return {"id": user.id, "username": user.username, "role": user.role,
            "active": user.active, "must_change_password": user.must_change_password}


def current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get(settings.session_cookie, "")
    session = db.scalar(select(LoginSession).where(LoginSession.token_hash == digest(token), LoginSession.expires_at > time.time())) if token else None
    user = db.get(User, session.user_id) if session else None
    if not user or not user.active:
        fail("UNAUTHENTICATED", "请登录", 401)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), session.csrf):
            fail("CSRF_REJECTED", "会话校验失败，请重新登录", 403)
    if user.must_change_password and request.url.path not in {"/api/v1/auth/me", "/api/v1/auth/change-password", "/api/v1/auth/logout"}:
        fail("PASSWORD_CHANGE_REQUIRED", "请先修改初始密码", 403)
    request.state.session = session
    return user


def admin(user=Depends(current_user)):
    if user.role != "admin":
        fail("FORBIDDEN", "需要管理员权限", 403)
    return user


def audit(db, user, action, target, details=None):
    db.add(Audit(actor_id=user.id, action=action, target=target, details=details or {}))


def validate_remote_url(url, allowed_hosts=None, resolve=True):
    parsed = urlsplit(url)
    private_allowed = os.getenv("ALLOW_PRIVATE_PROVIDERS", "false") == "true"
    if parsed.scheme not in ({"https", "http"} if private_allowed else {"https"}) or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("供应商及素材地址必须是无凭据的 HTTPS 地址")
    if allowed_hosts is not None and parsed.hostname not in allowed_hosts:
        raise ValueError("素材域名不在渠道允许列表")
    if resolve and not private_allowed:
        for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM):
            if not ipaddress.ip_address(item[4][0]).is_global:
                raise ValueError("禁止访问内部网络地址")
    return url


def validate_channel(data):
    validate_remote_url(data["base_url"], resolve=False)
    if urlsplit(data["base_url"]).query:
        raise ValueError("渠道地址不能包含查询参数")
    if not re.fullmatch(r"ELREN_PROVIDER_[A-Z0-9_]+", data["key_env"]):
        raise ValueError("凭据引用必须使用 ELREN_PROVIDER_ 开头的环境变量")
    for host in data["asset_hosts"]:
        if not re.fullmatch(r"[a-zA-Z0-9.-]+", host):
            raise ValueError("素材域名格式不正确")

