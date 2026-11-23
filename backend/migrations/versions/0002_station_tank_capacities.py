"""Add station fuel tank capacities.

The new columns are nullable so existing station records and historical data
remain unchanged until an administrator configures real tank capacities.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_station_tank_capacities"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "stations",
        sa.Column("pms_tank_capacity_litres", sa.Float(), nullable=True),
    )
    op.add_column(
        "stations",
        sa.Column("ago_tank_capacity_litres", sa.Float(), nullable=True),
    )


def downgrade():
    op.drop_column("stations", "ago_tank_capacity_litres")
    op.drop_column("stations", "pms_tank_capacity_litres")
