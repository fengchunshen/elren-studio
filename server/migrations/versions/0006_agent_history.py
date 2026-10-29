"""Persist manual conversation titles and archive deleted history."""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('canvas_agent_sessions', sa.Column('title_manual', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('canvas_agent_sessions', sa.Column('archived', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('canvas_agent_sessions', 'archived')
    op.drop_column('canvas_agent_sessions', 'title_manual')
