"""Add performance indexes on events and eisenhower_tasks

Revision ID: 0012
Revises: 0011
Create Date: 2026-02-26
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    # Główny query: WHERE user_id = X AND start_datetime >= Y AND start_datetime < Z
    op.create_index("ix_events_user_id_start", "events", ["user_id", "start_datetime"])

    # Lookup po user_id bez filtra dat (listAll, Eisenhower sync)
    op.create_index("ix_events_user_id", "events", ["user_id"])

    # Eisenhower tasks — filtr po user_id
    op.create_index("ix_eisenhower_tasks_user_id", "eisenhower_tasks", ["user_id"])

    # Contacts — filtr po user_id
    op.create_index("ix_contacts_user_id", "contacts", ["user_id"])

    # Activity templates — filtr po user_id
    op.create_index("ix_activity_templates_user_id", "activity_templates", ["user_id"])


def downgrade():
    op.drop_index("ix_events_user_id_start", "events")
    op.drop_index("ix_events_user_id", "events")
    op.drop_index("ix_eisenhower_tasks_user_id", "eisenhower_tasks")
    op.drop_index("ix_contacts_user_id", "contacts")
    op.drop_index("ix_activity_templates_user_id", "activity_templates")
