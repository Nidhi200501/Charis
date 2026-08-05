import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise SystemExit("DATABASE_URL is missing from backend/.env")

with psycopg.connect(database_url, connect_timeout=10) as connection:
    connection.execute("ALTER TABLE IF EXISTS consultations ADD COLUMN IF NOT EXISTS conversation JSONB NOT NULL DEFAULT '[]'")
    current_type = connection.execute(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'"
    ).fetchone()
    if not current_type:
        raise SystemExit("The users table does not exist. Run init_db.py first.")
    if current_type[0] in {"bigint", "integer"}:
        print("Numeric user IDs are already configured.")
    else:
        connection.execute("CREATE SEQUENCE IF NOT EXISTS users_numeric_id_seq")
        connection.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS numeric_id BIGINT")
        connection.execute("UPDATE users SET numeric_id = nextval('users_numeric_id_seq') WHERE numeric_id IS NULL")
        connection.execute("ALTER TABLE users ALTER COLUMN numeric_id SET DEFAULT nextval('users_numeric_id_seq')")
        connection.execute("ALTER SEQUENCE users_numeric_id_seq OWNED BY users.numeric_id")
        connection.execute("ALTER TABLE users ADD CONSTRAINT users_numeric_id_key UNIQUE (numeric_id)")

        for table in ("consultations", "saved_gifts", "gift_messages"):
            connection.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS numeric_user_id BIGINT")
            connection.execute(f"UPDATE {table} child SET numeric_user_id = users.numeric_id FROM users WHERE child.user_id = users.id")
            connection.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_user_id_fkey")
            connection.execute(f"ALTER TABLE {table} DROP COLUMN user_id")
            connection.execute(f"ALTER TABLE {table} RENAME COLUMN numeric_user_id TO user_id")
            connection.execute(f"ALTER TABLE {table} ADD CONSTRAINT {table}_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(numeric_id) ON DELETE CASCADE")

        connection.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey")
        connection.execute("ALTER TABLE users DROP COLUMN id")
        connection.execute("ALTER TABLE users RENAME COLUMN numeric_id TO id")
        connection.execute("ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id)")
        connection.execute("ALTER SEQUENCE users_numeric_id_seq OWNED BY users.id")
        connection.execute("SELECT setval('users_numeric_id_seq', COALESCE((SELECT MAX(id) FROM users), 0) + 1, false)")
        print("Migrated user IDs from UUIDs to sequential integers.")
