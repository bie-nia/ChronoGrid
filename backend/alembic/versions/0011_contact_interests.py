"""Add interests column to contacts

Revision ID: 0011
Revises: 0010
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("interests", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "interests")
