\set ON_ERROR_STOP on
SELECT current_database() = 'shindig_drafts_test' AS isolated_database \gset
\if :isolated_database
\else
  \echo 'Refusing to run outside isolated shindig_drafts_test'
  \quit 1
\endif
-- Apply migrations 001–014 first. No production data; all fixtures rolled back.
BEGIN;
CREATE FUNCTION pg_temp.try_publish(target uuid, payload jsonb, detail_revision integer,
  settings_revision integer, artwork_revision integer, publication_revision integer)
RETURNS integer LANGUAGE sql AS $$
  INSERT INTO event_publications (event_id, slug, snapshot, source_revisions)
    SELECT e.id, 'event-' || target::text, payload,
      jsonb_build_object('details', detail_revision, 'settings', settings_revision, 'artwork', artwork_revision, 'publication', publication_revision)
    FROM events e JOIN event_draft_settings s ON s.event_id = e.id
    LEFT JOIN event_draft_artwork a ON a.event_id = e.id
    LEFT JOIN event_publications p ON p.event_id = e.id
    WHERE e.id = target AND e.status = 'draft' AND e.revision = detail_revision
      AND s.revision = settings_revision AND coalesce(a.revision, 0) = artwork_revision
      AND coalesce(p.revision, 0) = publication_revision
    ON CONFLICT (event_id) DO UPDATE SET snapshot = EXCLUDED.snapshot, source_revisions = EXCLUDED.source_revisions,
      revision = event_publications.revision + 1, published_at = now()
      WHERE event_publications.revision = publication_revision
    RETURNING revision;
$$;
DO $$
DECLARE a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); before_live jsonb;
  payload jsonb := '{"details":{"title":"Reviewed public title"},"artwork":{},"settings":{}}';
BEGIN
  SELECT jsonb_agg(to_jsonb(r)) INTO before_live FROM rsvps r WHERE event_slug = 'oyster-roast-2026';
  INSERT INTO events(id,title) VALUES (a,'Private draft A'),(b,'Private draft B');
  INSERT INTO event_draft_settings(event_id, max_party_size, allow_comments, guest_list_default_visible, features)
    SELECT id, 4, false, false, '{"guestList":true,"playlist":false,"weather":false,"photos":false,"questions":false,"updates":false,"potluck":false,"polls":false}'::jsonb
    FROM events WHERE id IN (a,b);
  IF EXISTS (SELECT 1 FROM event_publications WHERE event_id IN (a,b)) THEN RAISE EXCEPTION 'Draft auto-published'; END IF;
  IF pg_temp.try_publish(a,payload,2,1,0,0) IS NOT NULL THEN RAISE EXCEPTION 'Stale details accepted'; END IF;
  IF pg_temp.try_publish(a,payload,1,2,0,0) IS NOT NULL THEN RAISE EXCEPTION 'Stale settings accepted'; END IF;
  IF pg_temp.try_publish(a,payload,1,1,1,0) IS NOT NULL THEN RAISE EXCEPTION 'Stale artwork accepted'; END IF;
  IF pg_temp.try_publish(a,payload,1,1,0,1) IS NOT NULL THEN RAISE EXCEPTION 'Wrong publication revision accepted'; END IF;
  IF pg_temp.try_publish(a,payload,1,1,0,0) <> 1 THEN RAISE EXCEPTION 'First publication failed'; END IF;
  IF pg_temp.try_publish(a,payload,1,1,0,0) IS NOT NULL THEN RAISE EXCEPTION 'Double submit rewrote publication'; END IF;
  IF (SELECT count(*) FROM event_publications WHERE event_id = a) <> 1 THEN RAISE EXCEPTION 'Duplicate publication'; END IF;
  UPDATE events SET title = 'Secret unpublished edit', revision = revision + 1 WHERE id = a;
  UPDATE event_draft_settings SET max_party_size = 3, revision = revision + 1 WHERE event_id = a;
  IF (SELECT snapshot FROM event_publications WHERE event_id = a) <> payload THEN RAISE EXCEPTION 'Draft edit changed published snapshot'; END IF;
  IF EXISTS (SELECT 1 FROM event_publications WHERE event_id = b) THEN RAISE EXCEPTION 'Other draft became public'; END IF;
  IF pg_temp.try_publish(a,payload,1,1,0,1) IS NOT NULL THEN RAISE EXCEPTION 'Old review published changed draft'; END IF;
  IF pg_temp.try_publish(a,'{"details":{"title":"Approved new version"}}',2,2,0,1) <> 2 THEN RAISE EXCEPTION 'Explicit republication failed'; END IF;
  IF pg_temp.try_publish(a,payload,2,2,0,1) IS NOT NULL THEN RAISE EXCEPTION 'Stale host overwrote newer publication'; END IF;
  BEGIN
    INSERT INTO event_publications(event_id,slug,snapshot,source_revisions) VALUES(b,'event-'||a::text,payload,'{}');
    RAISE EXCEPTION 'Cross-event publication identity accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT jsonb_agg(to_jsonb(r)) FROM rsvps r WHERE event_slug = 'oyster-roast-2026') IS DISTINCT FROM before_live THEN RAISE EXCEPTION 'Legacy RSVP data changed'; END IF;
  RAISE NOTICE 'PASS: explicit publication, draft privacy, snapshot isolation, reviewed revisions, duplicate/stale submission protection, identity constraints, unchanged legacy RSVPs';
END $$;
ROLLBACK;
