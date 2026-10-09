-- Requires migrations 001-019. Independent of the pending host-accounts 020.
-- Draft-only metadata: does not publish events or change guest data.
BEGIN;

CREATE OR REPLACE FUNCTION shindig_valid_event_location(value jsonb, address text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  RETURN coalesce(jsonb_typeof(value) = 'object'
    AND (value - ARRAY['address','matchedAddress','latitude','longitude','source']) = '{}'::jsonb
    AND jsonb_typeof(value->'address') = 'string' AND value->>'address' = btrim(address) AND length(btrim(address)) > 0
    AND jsonb_typeof(value->'matchedAddress') = 'string' AND length(btrim(value->>'matchedAddress')) BETWEEN 1 AND 300
    AND (value->>'matchedAddress') !~ '[[:cntrl:]]'
    AND jsonb_typeof(value->'latitude') = 'number' AND (value->>'latitude')::numeric BETWEEN -90 AND 90
    AND jsonb_typeof(value->'longitude') = 'number' AND (value->>'longitude')::numeric BETWEEN -180 AND 180
    AND value->>'source' IN ('census','manual','published'), false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'location_confirmation') THEN
    ALTER TABLE events ADD COLUMN location_confirmation jsonb;
    -- One-time preservation of coordinates already reviewed and published for
    -- this exact address. Replaying the migration never restores cleared data.
    UPDATE events e SET location_confirmation = jsonb_build_object(
      'address', btrim(e.address), 'matchedAddress', btrim(e.address),
      'latitude', p.snapshot->'coordinates'->'latitude',
      'longitude', p.snapshot->'coordinates'->'longitude', 'source', 'published')
    FROM event_publications p WHERE p.event_id = e.id
      AND btrim(e.address) = btrim(p.snapshot->'details'->>'address')
      AND shindig_valid_event_location(jsonb_build_object(
        'address', btrim(e.address), 'matchedAddress', btrim(e.address),
        'latitude', p.snapshot->'coordinates'->'latitude',
        'longitude', p.snapshot->'coordinates'->'longitude', 'source', 'published'), e.address);
  END IF;
END $$;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_location_confirmation_valid;
ALTER TABLE events ADD CONSTRAINT events_location_confirmation_valid
  CHECK (shindig_valid_event_location(location_confirmation, address));

CREATE OR REPLACE FUNCTION shindig_invalidate_event_location()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF btrim(NEW.address) IS DISTINCT FROM btrim(OLD.address) THEN NEW.location_confirmation := NULL; END IF;
  IF NEW.location_confirmation IS DISTINCT FROM OLD.location_confirmation THEN
    -- Location is part of the reviewed details revision, including direct SQL.
    IF NEW.revision = OLD.revision THEN NEW.revision := OLD.revision + 1; END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS events_invalidate_location ON events;
CREATE TRIGGER events_invalidate_location BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION shindig_invalidate_event_location();
COMMIT;
