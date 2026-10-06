BEGIN;
-- Publication is a reviewed snapshot, not a switch that exposes mutable drafts.
-- Existing events and every existing guest record remain untouched.
CREATE TABLE IF NOT EXISTS event_publications (
  event_id uuid PRIMARY KEY REFERENCES events(id),
  slug text NOT NULL UNIQUE REFERENCES event_data_scopes(slug),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 20000),
  source_revisions jsonb NOT NULL CHECK (jsonb_typeof(source_revisions) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_publications_identity CHECK (slug = 'event-' || event_id::text)
);
-- No backfill, seed, status change, or automatic publication. Only the protected
-- host action inserts a snapshot after reviewing all three saved revisions.
COMMIT;
