BEGIN;

-- Independent foundation for new events. No migration/backfill of the live
-- Oyster Roast, and no changes to its RSVP, content or invitation tables.
-- Publishing requires a later migration and implementation; every row is private.
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft' CONSTRAINT events_draft_only CHECK (status = 'draft'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  host_name text NOT NULL DEFAULT '' CHECK (char_length(host_name) <= 120),
  venue text NOT NULL DEFAULT '' CHECK (char_length(venue) <= 120),
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 300),
  city_label text NOT NULL DEFAULT '' CHECK (char_length(city_label) <= 100),
  time_zone text NOT NULL DEFAULT 'America/New_York' CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  starts_at timestamptz CHECK (starts_at >= '2000-01-01T00:00:00Z' AND starts_at < '2100-01-01T00:00:00Z'),
  ends_at timestamptz CHECK (ends_at >= '2000-01-01T00:00:00Z' AND ends_at < '2100-01-01T00:00:00Z'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_draft_dates CHECK (
    ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at AND ends_at <= starts_at + interval '168 hours')
  )
);

CREATE INDEX IF NOT EXISTS events_drafts_updated_idx ON events (updated_at DESC, id) WHERE status = 'draft';
COMMIT;
