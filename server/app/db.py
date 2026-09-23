import time
import uuid
from sqlalchemy import create_engine, String, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import settings


class Base(DeclarativeBase):
    pass


class Entity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)


engine = create_engine(settings.database_url, pool_pre_ping=True)
Session = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with Session() as db:
        yield db

