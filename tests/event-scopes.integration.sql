\set ON_ERROR_STOP on
SELECT current_database() = 'shindig_drafts_test' AS isolated_database \gset
\if :isolated_database
\else
  \echo 'Refusing to run outside isolated shindig_drafts_test'
  \quit 1
\endif
-- Apply migrations 001–013 first. All fixtures below are rolled back.
BEGIN;
DO $$
DECLARE
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  sa text; sb text; guest uuid := gen_random_uuid();
  song_a uuid := gen_random_uuid(); song_b uuid := gen_random_uuid();
  question_a uuid := gen_random_uuid(); update_a uuid := gen_random_uuid();
  poll_key uuid := gen_random_uuid(); option_a uuid := gen_random_uuid(); option_b uuid := gen_random_uuid();
  voter text := repeat('a', 64); affected integer; before_live jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(r)) INTO before_live FROM rsvps r WHERE event_slug = 'oyster-roast-2026';
  INSERT INTO events (id, title) VALUES (a, 'Synthetic gathering A'), (b, 'Synthetic gathering B');
  sa := 'event-' || a::text; sb := 'event-' || b::text;
  IF NOT EXISTS (SELECT 1 FROM event_data_scopes WHERE slug = sa AND event_id = a)
    OR NOT EXISTS (SELECT 1 FROM event_data_scopes WHERE slug = sb AND event_id = b)
    THEN RAISE EXCEPTION 'Event registration missing'; END IF;
  UPDATE events SET title = 'Renamed synthetic gathering' WHERE id = a;
  IF NOT EXISTS (SELECT 1 FROM event_data_scopes WHERE slug = sa AND event_id = a) THEN RAISE EXCEPTION 'Rename changed identity'; END IF;
  IF EXISTS (SELECT 1 FROM events e WHERE NOT EXISTS (SELECT 1 FROM event_data_scopes s WHERE s.event_id = e.id)) THEN RAISE EXCEPTION 'Existing draft missing backfill'; END IF;

  INSERT INTO rsvps (id, event_slug, guest_name, attending, party_size, display_on_guest_list, comment, edit_token_hash) VALUES
    (guest, sa, 'Visible A', true, 2, true, 'Private A note', repeat('1', 64)),
    (gen_random_uuid(), sa, 'Hidden A', true, 3, false, NULL, repeat('2', 64)),
    (gen_random_uuid(), sa, 'Declined A', false, NULL, false, NULL, repeat('3', 64)),
    (gen_random_uuid(), sb, 'Visible B', true, 8, true, NULL, repeat('4', 64));
  IF (SELECT sum(party_size) FROM rsvps WHERE event_slug = sa AND attending) <> 5
    OR (SELECT sum(party_size) FROM rsvps WHERE event_slug = sb AND attending) <> 8
    OR (SELECT string_agg(guest_name, ',') FROM rsvps WHERE event_slug = sa AND attending AND display_on_guest_list) <> 'Visible A'
    THEN RAISE EXCEPTION 'Guest totals/privacy crossed event boundaries'; END IF;
  IF EXISTS (SELECT 1 FROM rsvps WHERE event_slug = sb AND edit_token_hash = repeat('1', 64)) THEN RAISE EXCEPTION 'Cross-event edit token resolved'; END IF;
  UPDATE rsvps SET guest_name = 'Wrong event edit' WHERE event_slug = sb AND id = guest;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-event RSVP edit accepted'; END IF;
  UPDATE rsvps SET attending = false, party_size = NULL, display_on_guest_list = false, updated_at = now() WHERE event_slug = sa AND id = guest;
  IF NOT EXISTS (SELECT 1 FROM rsvps WHERE id = guest AND NOT attending AND party_size IS NULL) THEN RAISE EXCEPTION 'Decline normalization failed'; END IF;
  BEGIN
    INSERT INTO rsvps (id, event_slug, guest_name, attending, party_size) VALUES (gen_random_uuid(), 'unknown-event', 'Invalid', true, 1);
    RAISE EXCEPTION 'Unregistered event accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO playlist_suggestions (public_key, event_slug, provider, provider_track_id, song_title, artist)
    VALUES (song_a, sa, 'spotify', 'same-track', 'Same song', 'Artist'), (song_b, sb, 'spotify', 'same-track', 'Same song', 'Artist');
  INSERT INTO playlist_suggestions (event_slug, provider, provider_track_id, song_title, artist)
    VALUES (sa, 'spotify', 'same-track', 'Same song', 'Artist')
    ON CONFLICT (event_slug, provider, provider_track_id) WHERE provider IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Duplicate provider track accepted'; END IF;
  IF shindig_set_applause(sb, song_a, voter, true) IS NOT NULL THEN RAISE EXCEPTION 'Cross-event applause accepted'; END IF;
  IF shindig_set_applause(sa, song_a, voter, true) <> 1 OR shindig_set_applause(sa, song_a, voter, true) <> 1 THEN RAISE EXCEPTION 'Applause idempotency failed'; END IF;
  IF EXISTS (SELECT 1 FROM playlist_applause WHERE event_slug = sb) THEN RAISE EXCEPTION 'Applause crossed event'; END IF;

  INSERT INTO event_questions (id, event_slug, question, guest_name, submission_hash, answer, is_published, published_at) VALUES
    (question_a, sa, 'Public A question', 'Private name', repeat('5', 64), 'Public A answer', true, now()),
    (gen_random_uuid(), sa, 'Unpublished A question', NULL, repeat('6', 64), NULL, false, NULL),
    (gen_random_uuid(), sb, 'Public B question', NULL, repeat('7', 64), 'Public B answer', true, now());
  IF (SELECT string_agg(question, ',') FROM event_questions WHERE event_slug = sa AND is_published AND answer IS NOT NULL AND published_at IS NOT NULL) <> 'Public A question' THEN RAISE EXCEPTION 'Question privacy/scope failed'; END IF;
  UPDATE event_questions SET answer = 'Wrong event answer' WHERE event_slug = sb AND id = question_a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-event answer accepted'; END IF;
  INSERT INTO event_updates (id, event_slug, message) VALUES (update_a, sa, 'A update'), (gen_random_uuid(), sb, 'B update');
  DELETE FROM event_updates WHERE event_slug = sb AND id = update_a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-event update deletion accepted'; END IF;

  IF NOT shindig_save_poll(sa, poll_key, 'A question?', NULL, false, true, true, 0,
    jsonb_build_array(jsonb_build_object('key', option_a, 'text', 'One'), jsonb_build_object('key', option_b, 'text', 'Two')), true)
    THEN RAISE EXCEPTION 'Scoped poll creation failed'; END IF;
  IF shindig_poll_status(sb, poll_key, 'OPEN') THEN RAISE EXCEPTION 'Cross-event poll status accepted'; END IF;
  PERFORM shindig_poll_status(sa, poll_key, 'OPEN');
  IF shindig_set_poll_vote(sb, poll_key, ARRAY[option_a], voter) THEN RAISE EXCEPTION 'Cross-event poll vote accepted'; END IF;
  IF NOT shindig_set_poll_vote(sa, poll_key, ARRAY[option_a], voter) THEN RAISE EXCEPTION 'Scoped vote failed'; END IF;
  IF NOT shindig_set_poll_vote(sa, poll_key, ARRAY[option_a], voter) THEN RAISE EXCEPTION 'Scoped vote retry failed'; END IF;
  IF (SELECT responses FROM shindig_poll_totals t JOIN polls p ON p.id = t.poll_id WHERE p.public_key = poll_key) <> 1 THEN RAISE EXCEPTION 'Duplicate votes counted'; END IF;

  BEGIN
    UPDATE events SET status = 'published' WHERE id = a;
    RAISE EXCEPTION 'Foundation unexpectedly permits publishing';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT jsonb_agg(to_jsonb(r)) FROM rsvps r WHERE event_slug = 'oyster-roast-2026') IS DISTINCT FROM before_live THEN RAISE EXCEPTION 'Legacy RSVP data changed'; END IF;
  RAISE NOTICE 'PASS: registration, stable routes, scope foreign keys, RSVP/privacy/token isolation, track deduplication, applause, questions, updates, polls, unchanged legacy data, drafts remain private';
END $$;
ROLLBACK;
