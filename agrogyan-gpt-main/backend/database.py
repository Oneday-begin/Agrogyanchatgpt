"""Database engine, session factory and FastAPI session dependency.

Supports SQLite (local development, default) and PostgreSQL (DATABASE_URL in
production). Connection pooling and SQLite concurrency settings are configured
here so individual routes never need to think about them.
"""
from __future__ import annotations

import logging
import os
from typing import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

logger = logging.getLogger("agrogyan.database")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SQLITE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'agrogyan.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)

# Render/Heroku-style URLs use postgres://, SQLAlchemy expects postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        # FastAPI runs sync routes in a thread pool, so the connection must be
        # shareable across threads. `timeout` waits for locks instead of failing.
        connect_args={"check_same_thread": False, "timeout": 15},
    )

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
        cursor = dbapi_connection.cursor()
        # WAL lets readers proceed while a writer commits (fixes "database is locked").
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # drop dead connections transparently
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
        pool_timeout=int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "30")),
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_session() -> Iterator[Session]:
    """FastAPI dependency: yields a session and always releases it.

    Rolls back on any exception so a failed request never leaves a
    half-written transaction on a pooled connection.
    """
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database() -> bool:
    """Lightweight connectivity probe used by the /health endpoint."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("Database health check failed")
        return False


# Columns added after the first release. Older agrogyan.db files are upgraded
# in place so queries never fail with "no such column".
_LEGACY_COLUMNS: dict[str, dict[str, str]] = {
    "posts": {
        "likes": "INTEGER DEFAULT 0",
        "dislikes": "INTEGER DEFAULT 0",
        "reactions": "TEXT DEFAULT '{}'",
    },
    "users": {
        "mobile_number": "TEXT",
        "date_of_birth": "TEXT",
        "state": "TEXT",
        "district": "TEXT",
        "crop_name": "TEXT",
        "land_size": "TEXT",
        "soil_type": "TEXT",
        "season": "TEXT",
        "village": "TEXT",
        "preferred_language": "TEXT",
        "simple_mode": "TEXT",
        "role": "TEXT DEFAULT 'farmer'",
        "phone_verified": "BOOLEAN DEFAULT FALSE",
        "otp_channel": "TEXT",
        "created_at": "TIMESTAMP",
    },
}


def ensure_legacy_columns() -> None:
    """Add any missing columns to tables that already exist.

    Uses the SQLAlchemy inspector so it works on SQLite and PostgreSQL alike.
    Failures are logged rather than raised so a migration hiccup can never
    prevent the API from starting.
    """
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        with engine.begin() as conn:
            for table, columns in _LEGACY_COLUMNS.items():
                if table not in existing_tables:
                    continue
                present = {col["name"] for col in inspector.get_columns(table)}
                for name, ddl in columns.items():
                    if name in present:
                        continue
                    logger.info("Adding missing column %s.%s", table, name)
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    if table == "users" and name == "created_at":
                        conn.execute(text("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    except Exception:
        logger.exception("Schema upgrade check failed; continuing with existing schema")


ensure_legacy_columns()
