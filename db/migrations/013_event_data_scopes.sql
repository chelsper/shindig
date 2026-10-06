BEGIN;

-- Identity registry only, not publication or a copy of event configuration.
-- Preserve the hard-coded live event without turning it into an editable draft.
CREATE TABLE IF NOT EXISTS event_data_scopes (
  slug TEXT PRIMARY KEY,
  event_id UUID UNIQUE REFERENCES events(id),
  CONSTRAINT event_data_scopes_identity CHECK (
    (event_id IS NULL AND slug = 'oyster-roast-2026') OR
    (event_id IS NOT NULL AND slug = 'event-' || event_id::text)
  )
);
INSERT INTO event_data_scopes (slug) VALUES ('oyster-roast-2026') ON CONFLICT DO NOTHING;
INSERT INTO event_data_scopes (slug, event_id)
  SELECT 'event-' || id::text, id FROM events ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION shindig_register_event_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO event_data_scopes (slug, event_id) VALUES ('event-' || NEW.id::text, NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_register_scope ON events;
CREATE TRIGGER events_register_scope AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION shindig_register_event_scope();

-- Replace single-event checks with real referential integrity. No rows, tokens,
-- counts or privacy choices are rewritten. Unregistered events cannot receive data.
ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_event_slug_check;
ALTER TABLE playlist_suggestions DROP CONSTRAINT IF EXISTS playlist_suggestions_event_slug_check;
ALTER TABLE event_updates DROP CONSTRAINT IF EXISTS event_updates_event_slug_check;
ALTER TABLE event_questions DROP CONSTRAINT IF EXISTS event_questions_event_slug_check;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['rsvps', 'playlist_suggestions', 'event_updates', 'event_questions', 'polls'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = table_name || '_event_scope_fk' AND conrelid = table_name::regclass) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (event_slug) REFERENCES event_data_scopes(slug)', table_name, table_name || '_event_scope_fk');
    END IF;
  END LOOP;
END;
$$;

-- events_draft_only stays intact: no event is published by this migration.
COMMIT;
