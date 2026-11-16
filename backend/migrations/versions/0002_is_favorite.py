"""is_favorite column

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'pages',
        sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        sa.text("UPDATE pages SET is_favorite = :yes, page_type = 'normal' WHERE page_type = 'favorite'")
        .bindparams(yes=True)
    )


def downgrade():
    op.execute(
        sa.text("UPDATE pages SET page_type = 'favorite' WHERE is_favorite = :yes AND page_type = 'normal'")
        .bindparams(yes=True)
    )
    with op.batch_alter_table('pages') as batch:
        batch.drop_column('is_favorite')
