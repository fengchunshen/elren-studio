import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Channel

spec = importlib.util.spec_from_file_location(
    "credential_names", Path(__file__).resolve().parents[1] / "migrations/versions/0004_elren_credential_names.py")
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def run(engine, step):
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        step()


def test_channel_credential_references_move_to_elren_prefix_and_back(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([Channel(name=name, base_url='https://provider.example', key_env=key, concurrency=1)
                    for name, key in [('ark', 'TAPNOW_PROVIDER_ARK'), ('custom', 'OTHER_TAPNOW_PROVIDER_X')]])
        db.commit()
    keys = lambda: dict(engine.connect().execute(text('SELECT name, key_env FROM provider_channels')).all())

    run(engine, migration.upgrade)
    assert keys() == {'ark': 'ELREN_PROVIDER_ARK', 'custom': 'OTHER_TAPNOW_PROVIDER_X'}
    run(engine, migration.downgrade)
    assert keys() == {'ark': 'TAPNOW_PROVIDER_ARK', 'custom': 'OTHER_TAPNOW_PROVIDER_X'}
