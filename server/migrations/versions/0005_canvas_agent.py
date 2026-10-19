"""Project-scoped canvas agent sessions and durable action receipts."""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('canvas_agent_sessions',
        sa.Column('id', sa.String(36), primary_key=True), sa.Column('created_at', sa.Float(), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('offering_id', sa.String(36), sa.ForeignKey('model_offerings.id'), nullable=False),
        sa.Column('client_id', sa.String(100), nullable=False),
        sa.Column('title', sa.String(100), nullable=False), sa.Column('status', sa.String(30), nullable=False),
        sa.Column('messages', sa.JSON(), nullable=False), sa.Column('error', sa.Text()),
        sa.Column('lease_owner', sa.String(36)), sa.Column('lease_until', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.Float(), nullable=False))
    for key in ['created_at', 'user_id', 'project_id']:
        op.create_index(f'ix_canvas_agent_sessions_{key}', 'canvas_agent_sessions', [key])
    op.create_table('canvas_agent_actions',
        sa.Column('id', sa.String(36), primary_key=True), sa.Column('created_at', sa.Float(), nullable=False),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('canvas_agent_sessions.id'), nullable=False),
        sa.Column('call_id', sa.String(200), nullable=False), sa.Column('tool', sa.String(60), nullable=False),
        sa.Column('arguments', sa.JSON(), nullable=False), sa.Column('status', sa.String(30), nullable=False),
        sa.Column('result', sa.JSON()), sa.UniqueConstraint('session_id', 'call_id'))
    for key in ['created_at', 'session_id']:
        op.create_index(f'ix_canvas_agent_actions_{key}', 'canvas_agent_actions', [key])


def downgrade():
    op.drop_table('canvas_agent_actions')
    op.drop_table('canvas_agent_sessions')
