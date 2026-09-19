BEGIN;

-- Existing manual suggestions remain intact with NULL catalog metadata.
ALTER TABLE playlist_suggestions
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_track_id TEXT,
  ADD COLUMN IF NOT EXISTS album TEXT,
  ADD COLUMN IF NOT EXISTS artwork_url TEXT,
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS explicit BOOLEAN;

ALTER TABLE playlist_suggestions
  DROP CONSTRAINT IF EXISTS playlist_suggestions_song_title_check,
  DROP CONSTRAINT IF EXISTS playlist_suggestions_artist_check,
  DROP CONSTRAINT IF EXISTS playlist_suggestions_catalog_check,
  DROP CONSTRAINT IF EXISTS playlist_suggestions_album_check,
  DROP CONSTRAINT IF EXISTS playlist_suggestions_urls_check;
ALTER TABLE playlist_suggestions
  ADD CONSTRAINT playlist_suggestions_song_title_check CHECK (char_length(btrim(song_title)) BETWEEN 1 AND 512),
  ADD CONSTRAINT playlist_suggestions_artist_check CHECK (char_length(btrim(artist)) BETWEEN 1 AND 1024),
  ADD CONSTRAINT playlist_suggestions_catalog_check CHECK (
    (provider IS NULL AND provider_track_id IS NULL) OR
    (provider IS NOT NULL AND provider ~ '^[a-z][a-z0-9_-]{0,31}$'
      AND provider_track_id IS NOT NULL AND char_length(provider_track_id) BETWEEN 1 AND 128)
  ),
  ADD CONSTRAINT playlist_suggestions_album_check CHECK (album IS NULL OR char_length(album) BETWEEN 1 AND 512),
  ADD CONSTRAINT playlist_suggestions_urls_check CHECK (
    (artwork_url IS NULL OR (artwork_url LIKE 'https://%' AND char_length(artwork_url) <= 2048)) AND
    (external_url IS NULL OR (external_url LIKE 'https://%' AND char_length(external_url) <= 2048))
  );

CREATE UNIQUE INDEX IF NOT EXISTS playlist_suggestions_provider_track_idx
  ON playlist_suggestions (event_slug, provider, provider_track_id) WHERE provider IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS playlist_suggestions_legacy_song_idx
  ON playlist_suggestions (event_slug, lower(btrim(song_title)), lower(btrim(artist))) WHERE provider IS NULL;
DROP INDEX IF EXISTS playlist_suggestions_unique_song_idx;

-- Shared fixed-window quotas and provider Retry-After cooldowns across instances.
-- No raw IPs, names, search text, tokens, or credentials are stored here.
CREATE TABLE IF NOT EXISTS music_request_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS music_request_limits_expiry_idx ON music_request_limits (expires_at);

COMMIT;
