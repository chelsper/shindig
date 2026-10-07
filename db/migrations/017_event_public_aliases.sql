BEGIN;
-- Keep stable data scopes, RSVP tokens and calendar identities unchanged.
ALTER TABLE event_publications ADD COLUMN IF NOT EXISTS public_alias text;
CREATE UNIQUE INDEX IF NOT EXISTS event_publications_public_alias_key ON event_publications (public_alias);
ALTER TABLE event_publications DROP CONSTRAINT IF EXISTS event_publications_public_alias_check;
ALTER TABLE event_publications ADD CONSTRAINT event_publications_public_alias_check CHECK (
  public_alias IS NULL OR (
    char_length(public_alias) BETWEEN 3 AND 60
    AND public_alias ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND public_alias NOT LIKE 'event-%'
    AND public_alias NOT IN ('admin', 'api', 'event', 'events', 'rsvp', 'calendar', 'new', 'edit', 'preview', 'publish', 'settings', 'artwork', 'share', 'qr', 'invitation', 'login', 'logout', 'support', 'help', 'privacy', 'terms', 'shindig', 'jaspershucks', 'jasper-shucks', 'oyster-roast', 'oyster-roast-2026')
  )
);
-- A first publication owns its alias permanently, including while archived.
-- Existing publications keep NULL/their original URL. Never silently rename one.
CREATE OR REPLACE FUNCTION shindig_keep_event_public_alias() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_alias IS DISTINCT FROM OLD.public_alias THEN
    RAISE EXCEPTION 'Published event links cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS event_publications_keep_alias ON event_publications;
CREATE TRIGGER event_publications_keep_alias BEFORE UPDATE OF public_alias ON event_publications
FOR EACH ROW EXECUTE FUNCTION shindig_keep_event_public_alias();
COMMIT;
