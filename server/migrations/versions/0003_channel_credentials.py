"""Encrypted, channel-scoped provider credentials."""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('channel_credentials',
        sa.Column('channel_id', sa.String(36), sa.ForeignKey('provider_channels.id'), primary_key=True),
        sa.Column('ciphertext', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.Float(), nullable=False))


def downgrade():
    op.drop_table('channel_credentials')
