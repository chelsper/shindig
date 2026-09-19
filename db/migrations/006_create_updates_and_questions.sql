BEGIN;

CREATE TABLE IF NOT EXISTS event_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug TEXT NOT NULL CHECK (event_slug = 'oyster-roast-2026'),
  heading TEXT CHECK (heading IS NULL OR char_length(btrim(heading)) BETWEEN 1 AND 120),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 3000),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_updates_published_idx
  ON event_updates (event_slug, published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS event_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug TEXT NOT NULL CHECK (event_slug = 'oyster-roast-2026'),
  question TEXT NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 1000),
  guest_name TEXT CHECK (guest_name IS NULL OR char_length(btrim(guest_name)) BETWEEN 1 AND 80),
  submission_hash TEXT NOT NULL UNIQUE CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  answer TEXT CHECK (answer IS NULL OR char_length(btrim(answer)) BETWEEN 1 AND 2000),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_questions_publication_check CHECK (
    (is_published = true AND answer IS NOT NULL AND published_at IS NOT NULL)
    OR (is_published = false AND published_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS event_questions_public_idx
  ON event_questions (event_slug, published_at DESC, id DESC)
  WHERE is_published = true AND answer IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_questions_admin_idx
  ON event_questions (event_slug, created_at DESC, id DESC);

COMMIT;
