BEGIN;

ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS display_on_guest_list BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS rsvps_public_guest_list_idx
  ON rsvps (event_slug, guest_name)
  WHERE attending = TRUE AND display_on_guest_list = TRUE;

COMMIT;
