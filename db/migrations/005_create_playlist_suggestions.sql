BEGIN;

CREATE TABLE IF NOT EXISTS playlist_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug TEXT NOT NULL,
  song_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  suggested_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT playlist_suggestions_event_slug_check
    CHECK (event_slug = 'oyster-roast-2026'),
  CONSTRAINT playlist_suggestions_song_title_check
    CHECK (char_length(btrim(song_title)) BETWEEN 1 AND 160),
  CONSTRAINT playlist_suggestions_artist_check
    CHECK (char_length(btrim(artist)) BETWEEN 1 AND 120),
  CONSTRAINT playlist_suggestions_suggested_by_check
    CHECK (suggested_by IS NULL OR char_length(btrim(suggested_by)) BETWEEN 1 AND 80)
);

-- Enforce duplicate protection across concurrent requests and server instances.
CREATE UNIQUE INDEX IF NOT EXISTS playlist_suggestions_unique_song_idx
  ON playlist_suggestions (event_slug, lower(btrim(song_title)), lower(btrim(artist)));

CREATE INDEX IF NOT EXISTS playlist_suggestions_event_created_idx
  ON playlist_suggestions (event_slug, created_at DESC, id DESC);

COMMIT;
