-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/guest-interactions.integration.sql
-- Isolated disposable database ONLY; refuses any differently named database.
DO $$ BEGIN
  IF current_database() <> 'shindig_interactions_test' THEN RAISE EXCEPTION 'Use the isolated shindig_interactions_test database'; END IF;
END $$;
\ir ../db/migrations/005_create_playlist_suggestions.sql
\ir ../db/migrations/007_music_catalog.sql
INSERT INTO playlist_suggestions (id, event_slug, song_title, artist)
  VALUES ('a0000000-0000-4000-8000-000000000001', 'oyster-roast-2026', 'Integration legacy track', 'Test artist') ON CONFLICT DO NOTHING;
\ir ../db/migrations/008_guest_interactions_and_polls.sql
\ir ../db/migrations/008_guest_interactions_and_polls.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(value BOOLEAN, message TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;

BEGIN;
UPDATE playlist_suggestions SET public_key = 'a0000000-0000-4000-8000-000000000002' WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT song_title = 'Integration legacy track' FROM playlist_suggestions WHERE id = 'a0000000-0000-4000-8000-000000000001'), 'Legacy suggestion must survive');
SELECT pg_temp.assert_true(shindig_set_applause('oyster-roast-2026', 'a0000000-0000-4000-8000-000000000002', repeat('a',64), true) = 1, 'First applause');
SELECT pg_temp.assert_true(shindig_set_applause('oyster-roast-2026', 'a0000000-0000-4000-8000-000000000002', repeat('a',64), true) = 1, 'Repeat applause is idempotent');
SELECT pg_temp.assert_true(shindig_set_applause('oyster-roast-2026', 'a0000000-0000-4000-8000-000000000002', repeat('b',64), true) = 2, 'Independent browser applause');
SELECT pg_temp.assert_true(shindig_set_applause('other-event', 'a0000000-0000-4000-8000-000000000002', repeat('a',64), true) IS NULL, 'Other event rejected');
SELECT pg_temp.assert_true(shindig_set_applause('oyster-roast-2026', 'a0000000-0000-4000-8000-000000000002', repeat('a',64), false) = 1, 'Applause removal');
SELECT pg_temp.assert_true(shindig_set_applause('oyster-roast-2026', 'a0000000-0000-4000-8000-000000000002', repeat('a',64), false) = 1, 'Removal retry');

SELECT pg_temp.assert_true(shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'Best way to eat an oyster?', 'IMPORTANT RESEARCH', false, true, true, 0,
  '[{"key":"c0000000-0000-4000-8000-000000000001","text":"Raw"},{"key":"c0000000-0000-4000-8000-000000000002","text":"Grilled"},{"key":"c0000000-0000-4000-8000-000000000003","text":"Rockefeller"}]', true), 'Create private draft');
SELECT pg_temp.assert_true((SELECT status = 'DRAFT' FROM polls WHERE public_key = 'b0000000-0000-4000-8000-000000000001'), 'New polls default to draft');
SELECT pg_temp.assert_true(NOT shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', ARRAY['c0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Draft rejects votes');
SELECT pg_temp.assert_true(shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'Best way to eat an oyster?', 'IMPORTANT RESEARCH', false, true, true, 0,
  '[{"key":"c0000000-0000-4000-8000-000000000002","text":"Grilled"},{"key":"c0000000-0000-4000-8000-000000000001","text":"Raw"},{"key":"c0000000-0000-4000-8000-000000000004","text":"Absolutely not"}]', false), 'Edit/remove/add/reorder before votes');
SELECT pg_temp.assert_true(shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'OPEN'), 'Open draft');
SELECT pg_temp.assert_true(NOT shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', ARRAY['c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002']::uuid[], repeat('a',64)), 'Single choice rejects two choices');
SELECT pg_temp.assert_true(shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', ARRAY['c0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Single choice vote');
SELECT pg_temp.assert_true(shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', ARRAY['c0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Repeat vote idempotent');
SELECT pg_temp.assert_true((SELECT responses = 1 FROM shindig_poll_totals WHERE poll_id = (SELECT id FROM polls WHERE public_key = 'b0000000-0000-4000-8000-000000000001')), 'One respondent');
SELECT pg_temp.assert_true(shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', ARRAY['c0000000-0000-4000-8000-000000000002']::uuid[], repeat('a',64)), 'Change answer');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM poll_votes WHERE voter_token_hash = repeat('a',64)), 'Changed answer replaces old vote');
SELECT pg_temp.assert_true(NOT shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'Changed question', NULL, true, true, true, 0,
  '[{"key":"c0000000-0000-4000-8000-000000000002","text":"Grilled"},{"key":"c0000000-0000-4000-8000-000000000001","text":"Raw"},{"key":"c0000000-0000-4000-8000-000000000004","text":"Absolutely not"}]', false), 'Voting mode locked after first vote');
SELECT pg_temp.assert_true(NOT shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'Changed question', NULL, false, true, true, 0,
  '[{"key":"c0000000-0000-4000-8000-000000000002","text":"Different meaning"},{"key":"c0000000-0000-4000-8000-000000000001","text":"Raw"}]', false), 'Cannot remove/reword options after votes');
SELECT pg_temp.assert_true(shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'Oyster preparation?', 'IMPORTANT RESEARCH', false, false, false, 1,
  '[{"key":"c0000000-0000-4000-8000-000000000001","text":"Raw"},{"key":"c0000000-0000-4000-8000-000000000004","text":"Absolutely not"},{"key":"c0000000-0000-4000-8000-000000000002","text":"Grilled"}]', false), 'Question/results/reorder changes preserve votes');
SELECT pg_temp.assert_true(shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'CLOSED'), 'Close poll');
SELECT pg_temp.assert_true(NOT shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', ARRAY['c0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Closed rejects changes');
SELECT pg_temp.assert_true(NOT shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'DELETE_DRAFT'), 'Published poll cannot be deleted');
SELECT pg_temp.assert_true(shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'OPEN'), 'Safe reopen');
SELECT pg_temp.assert_true(shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000001', 'ARCHIVED'), 'Archive');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM poll_votes WHERE voter_token_hash = repeat('a',64)), 'Archive preserves history');

SELECT pg_temp.assert_true(shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000002', 'What should we bring?', NULL, true, true, true, 1,
  '[{"key":"d0000000-0000-4000-8000-000000000001","text":"Lemons"},{"key":"d0000000-0000-4000-8000-000000000002","text":"Hot sauce"},{"key":"d0000000-0000-4000-8000-000000000003","text":"Butter"}]', true), 'Create multiple choice');
SELECT shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000002', 'OPEN');
SELECT pg_temp.assert_true(NOT shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000002', ARRAY['c0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Options cannot cross polls');
SELECT pg_temp.assert_true(NOT shindig_set_poll_vote('other-event', 'b0000000-0000-4000-8000-000000000002', ARRAY['d0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Votes cannot cross events');
SELECT pg_temp.assert_true(shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000002', ARRAY['d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002']::uuid[], repeat('a',64)), 'Multiple selections');
SELECT pg_temp.assert_true(NOT shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000002', ARRAY['d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001']::uuid[], repeat('a',64)), 'Duplicate option rejected');
SELECT pg_temp.assert_true((SELECT responses = 1 FROM shindig_poll_totals WHERE poll_id = (SELECT id FROM polls WHERE public_key = 'b0000000-0000-4000-8000-000000000002')), 'Two choices still one respondent');
SELECT pg_temp.assert_true(shindig_set_poll_vote('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000002', ARRAY['d0000000-0000-4000-8000-000000000003']::uuid[], repeat('a',64)), 'Multiple choice replaces set');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM poll_votes WHERE poll_id = (SELECT id FROM polls WHERE public_key = 'b0000000-0000-4000-8000-000000000002')), 'Old selections removed');

DO $$
DECLARE pid UUID; oid UUID;
BEGIN
  SELECT id INTO pid FROM polls WHERE public_key = 'b0000000-0000-4000-8000-000000000001';
  SELECT id INTO oid FROM poll_options WHERE public_key = 'c0000000-0000-4000-8000-000000000001';
  BEGIN
    INSERT INTO poll_votes (poll_id, poll_option_id, voter_token_hash, allow_multiple) VALUES (pid, oid, repeat('a',64), false);
    RAISE EXCEPTION 'Single-choice uniqueness did not reject a second row';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO poll_votes (poll_id, poll_option_id, voter_token_hash, allow_multiple) VALUES (pid, oid, repeat('c',64), true);
    RAISE EXCEPTION 'Voting mode FK did not reject bypass';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

SELECT shindig_save_poll('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000003', 'Disposable draft', NULL, false, true, true, 1,
  '[{"key":"e0000000-0000-4000-8000-000000000001","text":"Yes"},{"key":"e0000000-0000-4000-8000-000000000002","text":"No"}]', true);
SELECT pg_temp.assert_true(shindig_poll_status('oyster-roast-2026', 'b0000000-0000-4000-8000-000000000003', 'DELETE_DRAFT'), 'Delete unused draft');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM poll_options WHERE public_key = 'e0000000-0000-4000-8000-000000000001'), 'Draft option cascade');
DELETE FROM playlist_suggestions WHERE id = 'a0000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM playlist_applause WHERE playlist_suggestion_id = 'a0000000-0000-4000-8000-000000000001'), 'Applause cascade');
ROLLBACK;
SELECT 'All interaction SQL assertions passed; test mutations rolled back.' AS result;
