import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise SystemExit("DATABASE_URL is missing from backend/.env")

schema = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
with psycopg.connect(database_url, connect_timeout=10) as connection:
    connection.execute(schema)
    rows = connection.execute(
        "SELECT tablename FROM pg_tables "
        "WHERE schemaname = 'public' "
        "AND tablename IN ('users', 'consultations', 'saved_gifts', 'gift_messages') "
        "ORDER BY tablename"
    ).fetchall()

print("Created tables: " + ", ".join(row[0] for row in rows))
