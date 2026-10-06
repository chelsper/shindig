-- Only run against a disposable test database after migrations 001–010.
BEGIN;
DO $$
DECLARE
  draft_id uuid := gen_random_uuid();
  original_rsvps bigint;
  original_settings jsonb;
  affected integer;
BEGIN
  IF current_database() NOT LIKE '%test%' THEN RAISE EXCEPTION 'Use an isolated test database'; END IF;
  INSERT INTO rsvps (id, event_slug, guest_name, attending, party_size) VALUES (gen_random_uuid(), 'oyster-roast-2026', 'Existing event sentinel', true, 2);
  INSERT INTO invitation_settings (event_slug, settings) VALUES ('oyster-roast-2026', '{"title":"Existing live invitation"}') ON CONFLICT (event_slug) DO NOTHING;
  SELECT count(*) INTO original_rsvps FROM rsvps;
  SELECT jsonb_agg(to_jsonb(i)) INTO original_settings FROM invitation_settings i;

  INSERT INTO events (id, title, updated_at) VALUES (draft_id, 'SQL draft', '2020-01-01T00:00:00Z');
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = draft_id AND status = 'draft' AND starts_at IS NULL AND ends_at IS NULL AND revision = 1)
    THEN RAISE EXCEPTION 'Minimal private draft failed'; END IF;

  INSERT INTO events (id, title) VALUES (draft_id, 'Duplicate') ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Duplicate creation inserted a row'; END IF;

  UPDATE events SET title = 'Updated draft', starts_at = '2026-11-07T22:00:00Z', ends_at = '2026-11-08T02:00:00Z',
    revision = revision + 1, updated_at = now() WHERE id = draft_id AND status = 'draft' AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Versioned update failed'; END IF;
  UPDATE events SET title = 'Stale write', revision = revision + 1 WHERE id = draft_id AND status = 'draft' AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale write overwrote draft'; END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = draft_id AND title = 'Updated draft' AND revision = 2 AND starts_at = '2026-11-07T22:00:00Z' AND updated_at > '2020-01-01T00:00:00Z')
    THEN RAISE EXCEPTION 'Stored details incorrect'; END IF;

  BEGIN
    UPDATE events SET status = 'published' WHERE id = draft_id;
    RAISE EXCEPTION 'Publishing should not be possible';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE events SET title = ' ' WHERE id = draft_id;
    RAISE EXCEPTION 'Blank title accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE events SET description = repeat('x', 2001) WHERE id = draft_id;
    RAISE EXCEPTION 'Oversized description accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE events SET ends_at = starts_at WHERE id = draft_id;
    RAISE EXCEPTION 'Invalid date order accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE events SET starts_at = NULL WHERE id = draft_id;
    RAISE EXCEPTION 'End without start accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE events SET ends_at = starts_at + interval '8 days' WHERE id = draft_id;
    RAISE EXCEPTION 'Oversized duration accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE events SET revision = 0 WHERE id = draft_id;
    RAISE EXCEPTION 'Invalid revision accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  IF (SELECT count(*) FROM rsvps) <> original_rsvps OR (SELECT jsonb_agg(to_jsonb(i)) FROM invitation_settings i) IS DISTINCT FROM original_settings
    THEN RAISE EXCEPTION 'Live event tables changed'; END IF;
  RAISE NOTICE 'PASS: create, reopen, update, duplicate protection, stale-write rejection, draft-only constraint, validation, preserved live tables';
END $$;
ROLLBACK;
