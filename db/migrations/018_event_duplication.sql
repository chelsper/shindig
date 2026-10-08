BEGIN;

-- A host-only idempotency receipt. Reservations do not create or publish events.
-- Only a completed, atomic draft copy points to an event. No guest data is copied.
CREATE TABLE IF NOT EXISTS event_duplication_requests (
  id uuid PRIMARY KEY,
  source_key text NOT NULL CHECK (
    source_key = 'oyster-roast-2026' OR
    source_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  requested_title text NOT NULL CHECK (char_length(btrim(requested_title)) BETWEEN 1 AND 180),
  completed_event_id uuid UNIQUE REFERENCES events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (source_key <> id::text),
  CHECK ((completed_event_id IS NULL) = (completed_at IS NULL)),
  CHECK (completed_event_id IS NULL OR completed_event_id = id)
);

COMMIT;
