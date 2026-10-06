BEGIN;
-- Separate private draft artwork. No live Oyster Roast settings are changed.
CREATE TABLE IF NOT EXISTS event_draft_artwork (
  event_id uuid PRIMARY KEY REFERENCES events(id),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object' AND octet_length(settings::text) <= 4096),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
