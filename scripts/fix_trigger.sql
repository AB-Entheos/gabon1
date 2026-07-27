CREATE OR REPLACE FUNCTION cases_event_immutable()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.amount_xaf IS NULL AND NEW.amount_xaf IS NOT NULL THEN
        RETURN NEW;
    END IF;
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