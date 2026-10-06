-- Disposable local test database only; migrations 001–011 must be applied.
BEGIN;
DO $$
DECLARE
  draft_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  image_settings jsonb := '{"invitation":{"path":null,"alt":""},"header":{"path":null,"alt":"","focalX":50,"focalY":50,"zoomPercent":100}}';
  affected integer;
  original_rsvps bigint;
  original_live_settings jsonb;
BEGIN
  IF current_database() NOT LIKE '%test%' THEN RAISE EXCEPTION 'Use an isolated test database'; END IF;
  SELECT count(*) INTO original_rsvps FROM rsvps;
  SELECT jsonb_agg(to_jsonb(i)) INTO original_live_settings FROM invitation_settings i;
  INSERT INTO events (id, title) VALUES (draft_id, 'Artwork test'), (second_id, 'Other private draft');
  INSERT INTO event_draft_artwork (event_id, settings, updated_at)
    SELECT id, image_settings, '2020-01-01T00:00:00Z'::timestamptz FROM events WHERE id = draft_id AND status = 'draft'
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM event_draft_artwork WHERE event_id = draft_id AND settings = image_settings AND revision = 1)
    THEN RAISE EXCEPTION 'Create/reopen artwork failed'; END IF;
  INSERT INTO event_draft_artwork (event_id, settings) VALUES (draft_id, image_settings) ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Duplicate artwork inserted'; END IF;
  UPDATE event_draft_artwork SET settings = jsonb_set(settings, '{header,focalX}', '75'), revision = revision + 1, updated_at = now()
    WHERE event_id = draft_id AND revision = 1 AND EXISTS (SELECT 1 FROM events WHERE id = draft_id AND status = 'draft');
  IF NOT EXISTS (SELECT 1 FROM event_draft_artwork WHERE event_id = draft_id AND revision = 2 AND settings #>> '{header,focalX}' = '75' AND updated_at > '2020-01-01T00:00:00Z')
    THEN RAISE EXCEPTION 'Artwork update failed'; END IF;
  UPDATE event_draft_artwork SET settings = image_settings, revision = revision + 1 WHERE event_id = draft_id AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale artwork overwrote newer settings'; END IF;
  IF EXISTS (SELECT 1 FROM event_draft_artwork WHERE event_id = second_id) THEN RAISE EXCEPTION 'Another draft changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = draft_id AND revision = 1 AND title = 'Artwork test' AND status = 'draft')
    THEN RAISE EXCEPTION 'Artwork changed event basics'; END IF;
  BEGIN
    INSERT INTO event_draft_artwork (event_id, settings) VALUES (gen_random_uuid(), image_settings);
    RAISE EXCEPTION 'Missing event should fail';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE event_draft_artwork SET settings = '[]' WHERE event_id = draft_id;
    RAISE EXCEPTION 'Invalid artwork shape accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE event_draft_artwork SET settings = jsonb_build_object('large', repeat('x', 4097)) WHERE event_id = draft_id;
    RAISE EXCEPTION 'Oversized settings accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT count(*) FROM rsvps) <> original_rsvps OR (SELECT jsonb_agg(to_jsonb(i)) FROM invitation_settings i) IS DISTINCT FROM original_live_settings
    THEN RAISE EXCEPTION 'Existing live event data changed'; END IF;
  RAISE NOTICE 'PASS: artwork create/reopen/update, duplicate and stale-save guards, event isolation, constraints, unchanged live data';
END $$;
ROLLBACK;
