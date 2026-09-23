"""Rename provider credential references to the Elren environment prefix."""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

LEGACY_PREFIX = 'TAPNOW_PROVIDER_'
PREFIX = 'ELREN_PROVIDER_'


def rename_prefix(old, new):
    # substr/|| behave the same on PostgreSQL and the SQLite test database.
    op.get_bind().execute(sa.text(
        'UPDATE provider_channels SET key_env = :new || substr(key_env, :tail) WHERE substr(key_env, 1, :length) = :old'),
        {'old': old, 'new': new, 'length': len(old), 'tail': len(old) + 1})


def upgrade():
    rename_prefix(LEGACY_PREFIX, PREFIX)


def downgrade():
    rename_prefix(PREFIX, LEGACY_PREFIX)
