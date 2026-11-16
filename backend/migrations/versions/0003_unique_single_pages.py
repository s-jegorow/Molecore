"""one home, notepad and todo page per user

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-16 12:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

SINGLE_PAGE_FILTER = sa.text("page_type IN ('home', 'notepad', 'todo')")


def upgrade():
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, user_id, page_type FROM pages "
        "WHERE page_type IN ('home', 'notepad', 'todo') ORDER BY id"
    )).fetchall()

    seen = set()
    for page_id, user_id, page_type in rows:
        if (user_id, page_type) not in seen:
            seen.add((user_id, page_type))
            continue
        conn.execute(
            sa.text("UPDATE pages SET page_type = 'normal' WHERE id = :id"),
            {"id": page_id},
        )

    op.create_index(
        'uq_pages_user_single_type',
        'pages',
        ['user_id', 'page_type'],
        unique=True,
        postgresql_where=SINGLE_PAGE_FILTER,
        sqlite_where=SINGLE_PAGE_FILTER,
    )


def downgrade():
    op.drop_index('uq_pages_user_single_type', table_name='pages')
