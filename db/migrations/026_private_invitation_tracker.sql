BEGIN;

-- A host's private planning list, not RSVPs, guest consent, or public Hub data.
-- No existing records are imported, linked, or changed by this migration.
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_event_slug_id_unique ON rsvps(event_slug, id);
CREATE TABLE IF NOT EXISTS event_invitees (
  id uuid PRIMARY KEY,
  event_slug text NOT NULL REFERENCES event_data_scopes(slug),
  guest_name text NOT NULL CHECK (char_length(btrim(guest_name)) BETWEEN 1 AND 120 AND guest_name !~ '[[:cntrl:]]'),
  email text CHECK (email IS NULL OR (char_length(email) BETWEEN 3 AND 254 AND email !~ '[[:space:][:cntrl:]]' AND email LIKE '%@%.%')),
  phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  invited_at timestamptz,
  rsvp_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The database also rejects cross-event links, including racing writes.
  -- Deleting an RSVP removes its link, never the host's planning entry.
  CONSTRAINT event_invitees_rsvp_fk FOREIGN KEY (event_slug, rsvp_id)
    REFERENCES rsvps(event_slug, id) ON DELETE SET NULL (rsvp_id),
  CONSTRAINT event_invitees_one_response UNIQUE (event_slug, rsvp_id)
);
CREATE INDEX IF NOT EXISTS event_invitees_event_created_idx ON event_invitees(event_slug, created_at DESC, id);
COMMIT;
