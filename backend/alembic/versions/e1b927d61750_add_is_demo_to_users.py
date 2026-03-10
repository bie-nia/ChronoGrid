"""add_is_demo_to_users

Revision ID: e1b927d61750
Revises: 0012
Create Date: 2026-03-08 20:24:23.106582

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1b927d61750'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dodaj kolumnę is_demo z domyślną wartością false dla istniejących wierszy
    op.add_column('users', sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.false()))
    # Usuń server_default — model będzie zarządzał wartością
    op.alter_column('users', 'is_demo', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'is_demo')
