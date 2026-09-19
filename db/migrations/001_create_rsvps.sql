BEGIN;

CREATE TABLE IF NOT EXISTS rsvps (
  id uuid PRIMARY KEY,
  event_slug text NOT NULL,
  guest_name text NOT NULL,
  attending boolean NOT NULL,
  party_size integer,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rsvps_event_slug_check
    CHECK (event_slug = 'oyster-roast-2026'),
  CONSTRAINT rsvps_guest_name_check
    CHECK (char_length(btrim(guest_name)) BETWEEN 1 AND 120),
  CONSTRAINT rsvps_party_size_check
    CHECK (
      (attending = true AND party_size BETWEEN 1 AND 20)
      OR
      (attending = false AND party_size IS NULL)
    ),
  CONSTRAINT rsvps_comment_length_check
    CHECK (comment IS NULL OR char_length(comment) <= 1000)
);

CREATE INDEX IF NOT EXISTS rsvps_event_slug_created_at_idx
  ON rsvps (event_slug, created_at DESC);

COMMIT;
