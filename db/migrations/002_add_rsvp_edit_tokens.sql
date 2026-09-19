BEGIN;

ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS edit_token_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS rsvps_edit_token_hash_idx
  ON rsvps (edit_token_hash)
  WHERE edit_token_hash IS NOT NULL;

COMMIT;
