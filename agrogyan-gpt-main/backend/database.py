import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SQLITE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'agrogyan.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)

# Render/Postgres may provide postgres://; SQLAlchemy expects postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Session
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for models
Base = declarative_base()


def _ensure_columns():
    """Ensure the expected columns exist in the posts table.

    This prevents `OperationalError: no such column` when a DB file was created
    before a schema change (e.g., added likes/dislikes).
    """

    with engine.connect() as conn:
        try:
            result = conn.execute(text("PRAGMA table_info(posts)"))
        except Exception:
            return

        existing_columns = {row[1] for row in result}

        if "likes" not in existing_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN likes INTEGER DEFAULT 0"))

        if "dislikes" not in existing_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN dislikes INTEGER DEFAULT 0"))

        if "reactions" not in existing_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN reactions TEXT DEFAULT '{}'"))

        try:
            user_result = conn.execute(text("PRAGMA table_info(users)"))
        except Exception:
            return

        existing_user_columns = {row[1] for row in user_result}

        if "mobile_number" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN mobile_number TEXT"))

        if "date_of_birth" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN date_of_birth TEXT"))

        if "state" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN state TEXT"))

        if "district" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN district TEXT"))

        if "crop_name" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN crop_name TEXT"))

        if "land_size" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN land_size TEXT"))

        if "soil_type" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN soil_type TEXT"))

        if "season" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN season TEXT"))

        if "village" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN village TEXT"))

        if "preferred_language" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN preferred_language TEXT"))

        if "simple_mode" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN simple_mode TEXT"))

        if "role" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'farmer'"))

        if "phone_verified" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT 0"))

        if "otp_channel" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN otp_channel TEXT"))

        if "created_at" not in existing_user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))
            conn.execute(text("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))

        conn.commit()


# Apply schema fixes automatically on import
_ensure_columns()
