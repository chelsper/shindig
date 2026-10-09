-- Disposable test database only; migrations 001–012 must be applied.
BEGIN;
DO $$
DECLARE
  draft_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  flags jsonb := '{"guestList":true,"playlist":false,"weather":false,"questions":false,"updates":false,"polls":false,"photos":false,"potluck":false}';
  affected integer;
  original_rsvps bigint;
  original_live_settings jsonb;
  malformed jsonb;
BEGIN
  IF current_database() NOT LIKE '%test%' THEN RAISE EXCEPTION 'Use an isolated test database'; END IF;
  SELECT count(*) INTO original_rsvps FROM rsvps;
  SELECT jsonb_agg(to_jsonb(i)) INTO original_live_settings FROM invitation_settings i;
  INSERT INTO events (id, title) VALUES (draft_id, 'Settings test'), (other_id, 'Other draft');
  INSERT INTO event_draft_settings (event_id, max_party_size, allow_comments, guest_list_default_visible, features, updated_at)
    SELECT id, 4, true, false, flags, '2020-01-01T00:00:00Z'::timestamptz FROM events WHERE id = draft_id AND status = 'draft'
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM event_draft_settings WHERE event_id = draft_id AND max_party_size = 4 AND NOT guest_list_default_visible AND features = flags AND revision = 1)
    THEN RAISE EXCEPTION 'Create/reopen settings failed'; END IF;
  INSERT INTO event_draft_settings (event_id, max_party_size, allow_comments, guest_list_default_visible, features)
    VALUES (draft_id, 20, true, true, flags) ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Duplicate settings inserted'; END IF;
  UPDATE event_draft_settings SET max_party_size = 1, allow_comments = false, features = jsonb_set(features, '{playlist}', 'true'), revision = revision + 1, updated_at = now()
    WHERE event_id = draft_id AND revision = 1 AND EXISTS (SELECT 1 FROM events WHERE id = draft_id AND status = 'draft');
  IF NOT EXISTS (SELECT 1 FROM event_draft_settings WHERE event_id = draft_id AND revision = 2 AND max_party_size = 1 AND NOT allow_comments AND features->'playlist' = 'true'::jsonb AND updated_at > '2020-01-01T00:00:00Z')
    THEN RAISE EXCEPTION 'Settings update failed'; END IF;
  UPDATE event_draft_settings SET max_party_size = 20, revision = revision + 1 WHERE event_id = draft_id AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale save overwrote settings'; END IF;
  IF EXISTS (SELECT 1 FROM event_draft_settings WHERE event_id = other_id) THEN RAISE EXCEPTION 'Another draft changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = draft_id AND revision = 1 AND title = 'Settings test' AND status = 'draft')
    OR EXISTS (SELECT 1 FROM event_draft_artwork WHERE event_id = draft_id) THEN RAISE EXCEPTION 'Event basics/artwork changed'; END IF;
  BEGIN
    INSERT INTO event_draft_settings (event_id, max_party_size, allow_comments, guest_list_default_visible, features) VALUES (gen_random_uuid(), 2, true, true, flags);
    RAISE EXCEPTION 'Missing draft should fail';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE event_draft_settings SET max_party_size = 0 WHERE event_id = draft_id;
    RAISE EXCEPTION 'Zero party size accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE event_draft_settings SET max_party_size = 21 WHERE event_id = draft_id;
    RAISE EXCEPTION 'Excessive party size accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE event_draft_settings SET allow_comments = NULL WHERE event_id = draft_id;
    RAISE EXCEPTION 'Null comment flag accepted';
  EXCEPTION WHEN not_null_violation THEN NULL; END;
  FOREACH malformed IN ARRAY ARRAY[
    '[]'::jsonb, '{}'::jsonb, 'null'::jsonb,
    flags - 'guestList', flags || '{"unknown":true}'::jsonb,
    jsonb_set(flags, '{guestList}', 'null'), jsonb_set(flags, '{weather}', '"true"'),
    jsonb_set(flags, '{photos}', 'true'), jsonb_set(flags, '{potluck}', '"true"')
  ] LOOP
    BEGIN
      UPDATE event_draft_settings SET features = malformed WHERE event_id = draft_id;
      RAISE EXCEPTION 'Malformed features accepted: %', malformed;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  IF (SELECT count(*) FROM rsvps) <> original_rsvps OR (SELECT jsonb_agg(to_jsonb(i)) FROM invitation_settings i) IS DISTINCT FROM original_live_settings
    THEN RAISE EXCEPTION 'Live event data changed'; END IF;
  RAISE NOTICE 'PASS: draft settings create/reopen/update, duplicate/stale guards, limits, feature constraints, draft isolation, unchanged live data';
END $$;
ROLLBACK;
