\set ON_ERROR_STOP on
-- Run only against an isolated, disposable Postgres database, never production.
-- From the repository root: psql "$TEST_DATABASE_URL" -f tests/music-catalog.integration.sql
\ir ../db/migrations/005_create_playlist_suggestions.sql

INSERT INTO playlist_suggestions (event_slug, song_title, artist, suggested_by)
VALUES ('oyster-roast-2026', 'Preserved legacy song', 'Legacy artist', 'Legacy guest');

\ir ../db/migrations/007_music_catalog.sql
-- Reapplication must also be safe.
\ir ../db/migrations/007_music_catalog.sql

BEGIN;
DO $$
DECLARE
  saved_id UUID;
  affected INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM playlist_suggestions WHERE song_title = 'Preserved legacy song'
    AND artist = 'Legacy artist' AND suggested_by = 'Legacy guest'
    AND provider IS NULL AND provider_track_id IS NULL) THEN
    RAISE EXCEPTION 'Legacy suggestion changed';
  END IF;

  INSERT INTO playlist_suggestions (event_slug, provider, provider_track_id, song_title, artist, album, artwork_url, external_url, explicit)
  VALUES ('oyster-roast-2026', 'spotify', '0000000000000000000001', 'Catalog song', 'Catalog artist', 'Album', NULL,
    'https://open.spotify.com/track/0000000000000000000001', true) RETURNING id INTO saved_id;
  IF NOT EXISTS (SELECT 1 FROM playlist_suggestions WHERE id = saved_id AND album = 'Album' AND artwork_url IS NULL AND explicit = true) THEN
    RAISE EXCEPTION 'Catalog metadata did not save';
  END IF;

  INSERT INTO playlist_suggestions (event_slug, provider, provider_track_id, song_title, artist)
  VALUES ('oyster-roast-2026', 'spotify', '0000000000000000000001', 'Spoofed new title', 'Different artist')
  ON CONFLICT (event_slug, provider, provider_track_id) WHERE provider IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Exact provider track was duplicated'; END IF;

  INSERT INTO playlist_suggestions (event_slug, provider, provider_track_id, song_title, artist)
  VALUES ('oyster-roast-2026', 'spotify', '0000000000000000000002', 'Catalog song', 'Catalog artist')
  ON CONFLICT (event_slug, provider, provider_track_id) WHERE provider IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Different stable track IDs were conflated'; END IF;

  BEGIN
    INSERT INTO playlist_suggestions (event_slug, song_title, artist)
    VALUES ('oyster-roast-2026', ' PRESERVED LEGACY SONG ', ' LEGACY ARTIST ');
    RAISE EXCEPTION 'Legacy uniqueness lost';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO playlist_suggestions (event_slug, provider, song_title, artist)
    VALUES ('oyster-roast-2026', 'spotify', 'Incomplete track', 'Artist');
    RAISE EXCEPTION 'Incomplete catalog identity accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO playlist_suggestions (event_slug, song_title, artist)
    VALUES ('other-event', 'Track', 'Artist');
    RAISE EXCEPTION 'Arbitrary event accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

INSERT INTO music_request_limits (bucket_key, request_count, expires_at)
VALUES ('test:bucket', 9, now() - interval '20 minutes'), ('test:expired', 1, now() - interval '20 minutes'),
  ('cooldown:test', 0, now() + interval '45 seconds');

-- Same atomic query used by the server, including excluded cleanup keys.
WITH expired AS (
  DELETE FROM music_request_limits WHERE expires_at < now() - interval '10 minutes'
    AND bucket_key <> 'test:bucket' AND bucket_key <> 'cooldown:test'
), counted AS (
  INSERT INTO music_request_limits (bucket_key, request_count, expires_at)
  VALUES ('test:bucket', 1, now() + interval '60 seconds')
  ON CONFLICT (bucket_key) DO UPDATE SET
    request_count = CASE WHEN music_request_limits.expires_at <= now() THEN 1 ELSE music_request_limits.request_count + 1 END,
    expires_at = CASE WHEN music_request_limits.expires_at <= now() THEN now() + interval '60 seconds' ELSE music_request_limits.expires_at END
  RETURNING request_count, expires_at
)
SELECT request_count AS count,
  greatest(1, ceil(extract(epoch FROM (expires_at - now())))) AS retry,
  coalesce((SELECT greatest(0, ceil(extract(epoch FROM (expires_at - now()))))
    FROM music_request_limits WHERE bucket_key = 'cooldown:test'), 0) AS cooldown
FROM counted;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM music_request_limits WHERE bucket_key = 'test:bucket' AND request_count = 1) THEN
    RAISE EXCEPTION 'Expired window not reset';
  END IF;
  IF EXISTS (SELECT 1 FROM music_request_limits WHERE bucket_key = 'test:expired') THEN
    RAISE EXCEPTION 'Stale bucket not cleaned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM music_request_limits WHERE bucket_key = 'cooldown:test' AND expires_at > now()) THEN
    RAISE EXCEPTION 'Active provider cooldown lost';
  END IF;
END $$;
ROLLBACK;
SELECT 'Catalog migration, saves, deduplication, legacy preservation, and shared quota SQL passed' AS result;
