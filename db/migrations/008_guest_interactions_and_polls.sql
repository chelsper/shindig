BEGIN;

-- Public locators are not authorization and reveal no internal playlist IDs.
ALTER TABLE playlist_suggestions ADD COLUMN IF NOT EXISTS public_key UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS playlist_suggestions_public_key_idx ON playlist_suggestions (public_key);
CREATE UNIQUE INDEX IF NOT EXISTS playlist_suggestions_id_event_idx ON playlist_suggestions (id, event_slug);

CREATE TABLE IF NOT EXISTS playlist_applause (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_suggestion_id UUID NOT NULL,
  event_slug TEXT NOT NULL,
  voter_token_hash TEXT NOT NULL CHECK (voter_token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (playlist_suggestion_id, event_slug) REFERENCES playlist_suggestions (id, event_slug) ON DELETE CASCADE,
  UNIQUE (playlist_suggestion_id, voter_token_hash)
);
CREATE INDEX IF NOT EXISTS playlist_applause_voter_idx ON playlist_applause (event_slug, voter_token_hash);

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  event_slug TEXT NOT NULL CHECK (char_length(btrim(event_slug)) BETWEEN 1 AND 100),
  question TEXT NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 240),
  eyebrow TEXT CHECK (eyebrow IS NULL OR char_length(btrim(eyebrow)) BETWEEN 1 AND 60),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED')),
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  show_results BOOLEAN NOT NULL DEFAULT true,
  show_closed_results BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  voting_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, allow_multiple)
);
CREATE INDEX IF NOT EXISTS polls_event_order_idx ON polls (event_slug, sort_order, created_at, id);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  poll_id UUID NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  option_text TEXT NOT NULL CHECK (char_length(btrim(option_text)) BETWEEN 1 AND 100),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 9),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS poll_options_text_idx ON poll_options (poll_id, lower(btrim(option_text)));

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL,
  poll_option_id UUID NOT NULL,
  voter_token_hash TEXT NOT NULL CHECK (voter_token_hash ~ '^[0-9a-f]{64}$'),
  -- This redundant flag is tied to the parent's voting rule by a foreign key.
  -- It permits a real unique constraint for single-choice polls, not just UI checks.
  allow_multiple BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (poll_id, allow_multiple) REFERENCES polls (id, allow_multiple),
  FOREIGN KEY (poll_id, poll_option_id) REFERENCES poll_options (poll_id, id) ON DELETE CASCADE,
  UNIQUE (poll_id, poll_option_id, voter_token_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_single_choice_idx ON poll_votes (poll_id, voter_token_hash) WHERE NOT allow_multiple;
CREATE INDEX IF NOT EXISTS poll_votes_voter_idx ON poll_votes (voter_token_hash, poll_id);

-- Derived aggregates only. This view never returns browser-token hashes.
CREATE OR REPLACE VIEW shindig_poll_totals AS
SELECT p.id AS poll_id,
  (SELECT count(DISTINCT v.voter_token_hash)::integer FROM poll_votes v WHERE v.poll_id = p.id) AS responses,
  coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.public_key, 'text', o.option_text) ORDER BY o.sort_order, o.id)
    FROM poll_options o WHERE o.poll_id = p.id), '[]'::jsonb) AS options,
  coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.public_key, 'count',
    (SELECT count(*)::integer FROM poll_votes v WHERE v.poll_option_id = o.id)) ORDER BY o.sort_order, o.id)
    FROM poll_options o WHERE o.poll_id = p.id), '[]'::jsonb) AS counts
FROM polls p;

-- Explicit desired state makes retries idempotent. Row locks serialize applause
-- counts and host deletion without collecting names, IPs, or device fingerprints.
CREATE OR REPLACE FUNCTION shindig_set_applause(p_event TEXT, p_key UUID, p_voter TEXT, p_active BOOLEAN)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE song_id UUID; total INTEGER;
BEGIN
  IF p_voter IS NULL OR p_voter !~ '^[0-9a-f]{64}$' OR p_active IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO song_id FROM playlist_suggestions WHERE event_slug = p_event AND public_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_active THEN
    INSERT INTO playlist_applause (playlist_suggestion_id, event_slug, voter_token_hash)
      VALUES (song_id, p_event, p_voter) ON CONFLICT (playlist_suggestion_id, voter_token_hash) DO NOTHING;
  ELSE
    DELETE FROM playlist_applause WHERE playlist_suggestion_id = song_id AND voter_token_hash = p_voter;
  END IF;
  SELECT count(*)::integer INTO total FROM playlist_applause WHERE playlist_suggestion_id = song_id;
  RETURN total;
END;
$$;

-- Replace a browser's selected set in one transaction. Closing/editing a poll
-- takes the same lock, so a concurrent request cannot vote after it closes.
CREATE OR REPLACE FUNCTION shindig_set_poll_vote(p_event TEXT, p_key UUID, p_options UUID[], p_voter TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE poll polls%ROWTYPE; chosen_count INTEGER;
BEGIN
  IF p_voter IS NULL OR p_voter !~ '^[0-9a-f]{64}$' OR coalesce(cardinality(p_options), 0) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  SELECT * INTO poll FROM polls WHERE event_slug = p_event AND public_key = p_key FOR UPDATE;
  IF NOT FOUND OR poll.status <> 'OPEN' THEN RETURN false; END IF;
  IF NOT poll.allow_multiple AND cardinality(p_options) <> 1 THEN RETURN false; END IF;
  SELECT count(*) INTO chosen_count FROM poll_options WHERE poll_id = poll.id AND public_key = ANY(p_options);
  IF chosen_count <> cardinality(p_options) THEN RETURN false; END IF;
  DELETE FROM poll_votes WHERE poll_id = poll.id AND voter_token_hash = p_voter;
  INSERT INTO poll_votes (poll_id, poll_option_id, voter_token_hash, allow_multiple)
    SELECT poll.id, id, p_voter, poll.allow_multiple FROM poll_options WHERE poll_id = poll.id AND public_key = ANY(p_options);
  UPDATE polls SET voting_started_at = coalesce(voting_started_at, now()) WHERE id = poll.id;
  RETURN true;
END;
$$;

-- Host writes use the same locked row. Once anybody has voted, keep option
-- meaning/membership and the single/multiple rule immutable, even after closing.
CREATE OR REPLACE FUNCTION shindig_save_poll(
  p_event TEXT, p_key UUID, p_question TEXT, p_eyebrow TEXT, p_multiple BOOLEAN,
  p_results BOOLEAN, p_closed_results BOOLEAN, p_order INTEGER, p_options JSONB, p_create BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE poll polls%ROWTYPE; item JSONB; idx INTEGER := 0; inserted_id UUID;
BEGIN
  IF jsonb_typeof(p_options) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_options) NOT BETWEEN 2 AND 10 THEN RETURN false; END IF;
  IF (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_options)) <> jsonb_array_length(p_options) THEN RETURN false; END IF;
  IF p_create THEN
    INSERT INTO polls (public_key, event_slug, question, eyebrow, allow_multiple, show_results, show_closed_results, sort_order)
      VALUES (p_key, p_event, p_question, p_eyebrow, p_multiple, p_results, p_closed_results, p_order)
      ON CONFLICT (public_key) DO NOTHING RETURNING id INTO inserted_id;
    IF inserted_id IS NULL THEN
      RETURN EXISTS (SELECT 1 FROM polls WHERE public_key = p_key AND event_slug = p_event);
    END IF;
  END IF;
  SELECT * INTO poll FROM polls WHERE event_slug = p_event AND public_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF poll.voting_started_at IS NOT NULL THEN
    IF p_multiple IS DISTINCT FROM poll.allow_multiple THEN RETURN false; END IF;
    IF (SELECT count(*) FROM poll_options WHERE poll_id = poll.id) <> jsonb_array_length(p_options)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_options) v WHERE NOT EXISTS (
        SELECT 1 FROM poll_options o WHERE o.poll_id = poll.id AND o.public_key = (v->>'key')::uuid AND o.option_text = v->>'text'
      )) THEN RETURN false; END IF;
  ELSE
    DELETE FROM poll_options WHERE poll_id = poll.id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_options) LOOP
    IF poll.voting_started_at IS NULL THEN
      INSERT INTO poll_options (public_key, poll_id, option_text, sort_order) VALUES ((item->>'key')::uuid, poll.id, item->>'text', idx);
    ELSE
      UPDATE poll_options SET sort_order = idx WHERE poll_id = poll.id AND public_key = (item->>'key')::uuid;
    END IF;
    idx := idx + 1;
  END LOOP;
  UPDATE polls SET question = p_question, eyebrow = p_eyebrow, allow_multiple = p_multiple,
    show_results = p_results, show_closed_results = p_closed_results, sort_order = p_order, updated_at = now() WHERE id = poll.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION shindig_poll_status(p_event TEXT, p_key UUID, p_status TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE poll polls%ROWTYPE;
BEGIN
  SELECT * INTO poll FROM polls WHERE event_slug = p_event AND public_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_status = 'DELETE_DRAFT' THEN
    IF poll.status <> 'DRAFT' OR poll.voting_started_at IS NOT NULL THEN RETURN false; END IF;
    DELETE FROM polls WHERE id = poll.id;
    RETURN true;
  END IF;
  IF p_status NOT IN ('OPEN', 'CLOSED', 'ARCHIVED') OR p_status IS NULL THEN RETURN false; END IF;
  IF p_status = 'OPEN' AND (SELECT count(*) FROM poll_options WHERE poll_id = poll.id) < 2 THEN RETURN false; END IF;
  UPDATE polls SET status = p_status, updated_at = now() WHERE id = poll.id;
  RETURN true;
END;
$$;

-- Deliberately no production poll seed. The host creates/publishes the initial
-- Oyster Roast question from /admin/polls after reviewing it.
COMMIT;
