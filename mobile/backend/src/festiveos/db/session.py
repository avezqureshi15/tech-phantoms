from collections.abc import Iterator

from sqlalchemy import Connection, create_engine, event
from sqlalchemy.orm import Session, SessionTransaction, sessionmaker

from festiveos.config import get_database_url, get_settings

# The engine owns the connection pool. Create it once per process and reuse it.
# It connects lazily, so importing this module does not open a connection.
engine = create_engine(
    get_database_url(),
    # Pool sizes are SQLAlchemy's defaults (5 kept open + 10 overflow = 15 per process).
    # Budget workers x 15 against your database plan's connection limit.
    pool_pre_ping=True,  # test a connection before use, replacing dead ones
    connect_args={"connect_timeout": 10},
)

# A session is one unit of work (usually one request). The factory builds them.
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    with SessionLocal() as session:
        yield session


@event.listens_for(Session, "after_begin")
def bound_waits(
    _session: Session, _transaction: SessionTransaction, connection: Connection
) -> None:
    """Cap how long any statement, lock wait or idle transaction can hold a connection.

    SET LOCAL lasts exactly one transaction, so it also works behind a transaction-mode pooler.
    The values are validated integers, never user input.
    """
    if connection.dialect.name != "postgresql":
        return
    settings = get_settings()
    connection.exec_driver_sql(
        f"SET LOCAL lock_timeout = {settings.db_lock_timeout_ms}; "
        f"SET LOCAL statement_timeout = {settings.db_statement_timeout_ms}; "
        "SET LOCAL idle_in_transaction_session_timeout = "
        f"{settings.db_idle_in_transaction_timeout_ms}"
    )
