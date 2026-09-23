import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://elren:elren@localhost:55432/elren")
    public_origin: str = os.getenv("PUBLIC_ORIGIN", "http://localhost:5173").rstrip("/")
    asset_dir: Path = Path(os.getenv("ASSET_DIR", "./data/assets"))
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "true").lower() == "true"
    session_seconds: int = 43200
    max_upload_bytes: int = 100 * 1024 * 1024
    max_pending_per_user: int = 20
    session_cookie: str = "elren_session"


settings = Settings()

