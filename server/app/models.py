from decimal import Decimal
import time
from sqlalchemy import String, Text, JSON, Boolean, Float, Integer, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, Entity


class User(Entity, Base):
    __tablename__ = "users"
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="user")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)


class LoginHit(Entity, Base):
    __tablename__ = "login_hits"
    key: Mapped[str] = mapped_column(String(64), index=True)


class LoginSession(Entity, Base):
    __tablename__ = "sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[float] = mapped_column(Float)


class Project(Entity, Base):
    __tablename__ = "projects"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class CanvasAgentSession(Entity, Base):
    __tablename__ = "canvas_agent_sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    offering_id: Mapped[str] = mapped_column(ForeignKey("model_offerings.id"))
    client_id: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(100), default="新对话")
    title_manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    status: Mapped[str] = mapped_column(String(30), default="idle")
    messages: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    lease_owner: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class CanvasAgentAction(Entity, Base):
    __tablename__ = "canvas_agent_actions"
    __table_args__ = (UniqueConstraint("session_id", "call_id"),)
    session_id: Mapped[str] = mapped_column(ForeignKey("canvas_agent_sessions.id"), index=True)
    call_id: Mapped[str] = mapped_column(String(200))
    tool: Mapped[str] = mapped_column(String(60))
    arguments: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Channel(Entity, Base):
    __tablename__ = "provider_channels"
    name: Mapped[str] = mapped_column(String(100))
    base_url: Mapped[str] = mapped_column(String(1000))
    key_env: Mapped[str] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    concurrency: Mapped[int] = mapped_column(Integer, default=2)
    asset_hosts: Mapped[list] = mapped_column(JSON, default=list)


class ChannelCredential(Base):
    __tablename__ = "channel_credentials"
    channel_id: Mapped[str] = mapped_column(ForeignKey("provider_channels.id"), primary_key=True)
    ciphertext: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[float] = mapped_column(Float)


class Offering(Entity, Base):
    __tablename__ = "model_offerings"
    name: Mapped[str] = mapped_column(String(200))
    channel_id: Mapped[str] = mapped_column(ForeignKey("provider_channels.id"))
    upstream_model: Mapped[str] = mapped_column(String(200))
    operation: Mapped[str] = mapped_column(String(50))
    adapter: Mapped[str] = mapped_column(String(50))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=False)


class Price(Entity, Base):
    __tablename__ = "price_versions"
    offering_id: Mapped[str] = mapped_column(ForeignKey("model_offerings.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3))
    display_currency: Mapped[str] = mapped_column(String(3), default="CNY")
    fx: Mapped[str] = mapped_column(String(50))
    markup: Mapped[str] = mapped_column(String(50), default="0")
    components: Mapped[list] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(Text)
    published_at: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)


class Quote(Entity, Base):
    __tablename__ = "quotes"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    expires_at: Mapped[float] = mapped_column(Float)


class Task(Entity, Base):
    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"), Index("task_schedule", "status", "next_at"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    offering_id: Mapped[str] = mapped_column(ForeignKey("model_offerings.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100))
    fingerprint: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    sale_snapshot: Mapped[dict] = mapped_column(JSON)
    offering_snapshot: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    billing_status: Mapped[str] = mapped_column(String(30), default="pending")
    cost_status: Mapped[str] = mapped_column(String(30), default="pending")
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    test: Mapped[bool] = mapped_column(Boolean, default=False)
    next_at: Mapped[float] = mapped_column(Float, default=0)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    finished_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class Attempt(Entity, Base):
    __tablename__ = "task_attempts"
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), unique=True)
    channel_id: Mapped[str] = mapped_column(ForeignKey("provider_channels.id"))
    cost_snapshot: Mapped[dict] = mapped_column(JSON)
    remote_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    state: Mapped[str] = mapped_column(String(30), default="submitting")
    response: Mapped[dict] = mapped_column(JSON, default=dict)


class Usage(Entity, Base):
    __tablename__ = "usage_records"
    __table_args__ = (UniqueConstraint("attempt_id", "evidence_hash"),)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("task_attempts.id"))
    evidence_hash: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(50))
    raw: Mapped[dict] = mapped_column(JSON)
    meters: Mapped[dict] = mapped_column(JSON)


class Entry(Entity, Base):
    __tablename__ = "charge_entries"
    entry_key: Mapped[str] = mapped_column(String(200), unique=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3))
    original_amount: Mapped[Decimal] = mapped_column(Numeric(24, 12))
    amount: Mapped[Decimal] = mapped_column(Numeric(24, 12))
    display_currency: Mapped[str] = mapped_column(String(3))
    details: Mapped[dict] = mapped_column(JSON)
    original_entry_id: Mapped[str | None] = mapped_column(ForeignKey("charge_entries.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class Asset(Entity, Base):
    __tablename__ = "assets"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    output_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_key: Mapped[str] = mapped_column(String(100))
    mime: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(200))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    __table_args__ = (UniqueConstraint("task_id", "output_index"),)


class Audit(Entity, Base):
    __tablename__ = "audit_events"
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class MediaJob(Entity, Base):
    __tablename__ = "media_jobs"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    request_key: Mapped[str] = mapped_column(String(200))
    __table_args__ = (UniqueConstraint("user_id", "request_key"),)
