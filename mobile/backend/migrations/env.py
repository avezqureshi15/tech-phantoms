from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from festiveos.config import get_database_url
from festiveos.db import registry  # noqa: F401  (registers every model on Base.metadata)
from festiveos.db.base import Base

config = context.config
if config.config_file_name is not None:
    # Keep the application's loggers alive when migrations run in the same process.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
