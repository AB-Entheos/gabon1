"""Immutable audit log: cases_event rows may never be UPDATEd or DELETEd.

PostgreSQL (prod): a real BEFORE UPDATE OR DELETE trigger that RAISES.
SQLite (dev): enforced at the Django ORM layer via an explicit
read-only test in the verify script; SQLite supports triggers but the
syntax differs enough from PG that a no-op + an ORM check is cleaner.

This is the master spec §7.10 non-negotiable.  See:
  - PostgreSQL trigger source below
  - Test in scripts/verify_phase2.py
"""
from django.db import migrations


SQLITE_SENTINEL = """
-- SQLite: no-op. Immutability is asserted in Python (see verify_phase2.py).
SELECT 1;
"""

POSTGRES_FORWARD = """
CREATE OR REPLACE FUNCTION cases_event_immutable()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'cases_event is append-only (id=%, type=%)', OLD.id, OLD.event_type
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_event_no_update ON cases_event;
CREATE TRIGGER cases_event_no_update
    BEFORE UPDATE ON cases_event
    FOR EACH ROW
    EXECUTE FUNCTION cases_event_immutable();

DROP TRIGGER IF EXISTS cases_event_no_delete ON cases_event;
CREATE TRIGGER cases_event_no_delete
    BEFORE DELETE ON cases_event
    FOR EACH ROW
    EXECUTE FUNCTION cases_event_immutable();
"""

POSTGRES_REVERSE = """
DROP TRIGGER IF EXISTS cases_event_no_update ON cases_event;
DROP TRIGGER IF EXISTS cases_event_no_delete ON cases_event;
DROP FUNCTION IF EXISTS cases_event_immutable();
"""


def install(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        with schema_editor.connection.cursor() as cur:
            cur.execute(POSTGRES_FORWARD)
    # SQLite + others: no-op; immutability is asserted in tests.


def remove(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        with schema_editor.connection.cursor() as cur:
            cur.execute(POSTGRES_REVERSE)


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(install, remove),
    ]
