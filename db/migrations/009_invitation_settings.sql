BEGIN;

-- One host-editable invitation, not a multi-event system. Existing RSVP rows,
-- edit tokens, Hub artwork and event identity are untouched. No seed required.
CREATE TABLE IF NOT EXISTS invitation_settings (
  event_slug text PRIMARY KEY CHECK (event_slug = 'oyster-roast-2026'),
  settings jsonb NOT NULL CHECK (
    jsonb_typeof(settings) = 'object' AND octet_length(settings::text) <= 16384
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
