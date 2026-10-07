BEGIN;
-- Non-destructive: existing publications stay live and accepting RSVPs.
-- The reviewed snapshot, guest data, edit tokens and stable URLs are retained.
ALTER TABLE event_publications
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'published'
    CHECK (visibility IN ('published', 'unpublished')),
  ADD COLUMN IF NOT EXISTS rsvps_open boolean NOT NULL DEFAULT true;
-- The existing revision is also the concurrency token for lifecycle changes.
-- No draft is published and the legacy Oyster Roast is not modified.
COMMIT;
