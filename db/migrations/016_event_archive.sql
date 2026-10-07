BEGIN;
-- Archive is a retained publication state, never a delete or a new event.
-- Replacing these constraints is transactional and safe to reapply.
ALTER TABLE event_publications
  DROP CONSTRAINT IF EXISTS event_publications_visibility_check,
  DROP CONSTRAINT IF EXISTS event_publications_archived_rsvps_closed;
ALTER TABLE event_publications
  ADD CONSTRAINT event_publications_visibility_check
    CHECK (visibility IN ('published', 'unpublished', 'archived')),
  ADD CONSTRAINT event_publications_archived_rsvps_closed
    CHECK (visibility <> 'archived' OR NOT rsvps_open);
-- No data is changed; current events, working drafts and Jasper Shucks stay put.
COMMIT;
