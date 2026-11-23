"""Add station fuel tank capacities.

The initial schema migration creates tables from current metadata. Column
existence checks keep this migration safe for both fresh databases (where the
columns may already exist) and existing databases (where they must be added).
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_station_tank_capacities"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    existing = {column["name"] for column in sa.inspect(bind).get_columns("stations")}
    if "pms_tank_capacity_litres" not in existing:
        op.add_column(
            "stations",
            sa.Column("pms_tank_capacity_litres", sa.Float(), nullable=True),
        )
    if "ago_tank_capacity_litres" not in existing:
        op.add_column(
            "stations",
            sa.Column("ago_tank_capacity_litres", sa.Float(), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    existing = {column["name"] for column in sa.inspect(bind).get_columns("stations")}
    if "ago_tank_capacity_litres" in existing:
        op.drop_column("stations", "ago_tank_capacity_litres")
    if "pms_tank_capacity_litres" in existing:
        op.drop_column("stations", "pms_tank_capacity_litres")
