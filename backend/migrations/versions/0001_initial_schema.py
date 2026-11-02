"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-31 22:41:21.165389

"""
from alembic import op
import sqlalchemy as sa


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'calendar_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('date', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('time', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_calendar_events_date', 'calendar_events', ['date'], unique=False)
    op.create_index('ix_calendar_events_id', 'calendar_events', ['id'], unique=False)
    op.create_index('ix_calendar_events_user_id', 'calendar_events', ['user_id'], unique=False)

    op.create_table(
        'pages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('page_type', sa.String(), nullable=True),
        sa.Column('icon', sa.String(), nullable=True),
        sa.Column('header', sa.String(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['parent_id'], ['pages.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pages_id', 'pages', ['id'], unique=False)
    op.create_index('ix_pages_title', 'pages', ['title'], unique=False)
    op.create_index('ix_pages_user_id', 'pages', ['user_id'], unique=False)

    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('preferences', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_preferences_id', 'user_preferences', ['id'], unique=False)
    op.create_index('ix_user_preferences_user_id', 'user_preferences', ['user_id'], unique=True)


def downgrade():
    op.drop_index('ix_user_preferences_user_id', table_name='user_preferences')
    op.drop_index('ix_user_preferences_id', table_name='user_preferences')
    op.drop_table('user_preferences')

    op.drop_index('ix_pages_user_id', table_name='pages')
    op.drop_index('ix_pages_title', table_name='pages')
    op.drop_index('ix_pages_id', table_name='pages')
    op.drop_table('pages')

    op.drop_index('ix_calendar_events_user_id', table_name='calendar_events')
    op.drop_index('ix_calendar_events_id', table_name='calendar_events')
    op.drop_index('ix_calendar_events_date', table_name='calendar_events')
    op.drop_table('calendar_events')
