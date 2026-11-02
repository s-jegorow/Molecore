import logging

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from database import engine

logging.basicConfig(level=logging.INFO)

config = Config("alembic.ini")
tables = inspect(engine).get_table_names()

# installs from before alembic already have the tables, just mark them as 0001
if "pages" in tables and "alembic_version" not in tables:
    command.stamp(config, "0001")

command.upgrade(config, "head")
