"""Persistent local video processing jobs."""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('media_jobs',
        sa.Column('id', sa.String(36), primary_key=True), sa.Column('created_at', sa.Float(), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False), sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=False), sa.Column('error', sa.Text()),
        sa.Column('progress', sa.Integer(), nullable=False), sa.Column('lease_until', sa.Float(), nullable=False),
        sa.Column('lease_token', sa.String(36)), sa.Column('request_key', sa.String(200), nullable=False),
        sa.UniqueConstraint('user_id', 'request_key'))
    for column in ['created_at', 'user_id', 'project_id', 'status']:
        op.create_index(f'ix_media_jobs_{column}', 'media_jobs', [column])


def downgrade():
    op.drop_table('media_jobs')
