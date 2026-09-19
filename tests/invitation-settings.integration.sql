-- Disposable test database only. This transaction restores all starting data.
BEGIN;
DO $$
DECLARE original_guests bigint; original_songs bigint; affected integer;
BEGIN
  IF current_database() NOT LIKE '%test%' THEN RAISE EXCEPTION 'Use an isolated test database'; END IF;
  SELECT count(*) INTO original_guests FROM rsvps;
  SELECT count(*) INTO original_songs FROM playlist_suggestions;
  DELETE FROM invitation_settings WHERE event_slug = 'oyster-roast-2026';

  INSERT INTO invitation_settings (event_slug, settings)
  VALUES ('oyster-roast-2026', '{"title":"SQL test"}'::jsonb)
  ON CONFLICT (event_slug) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'First publish failed'; END IF;

  INSERT INTO invitation_settings (event_slug, settings)
  VALUES ('oyster-roast-2026', '{"title":"Competing first publish"}'::jsonb)
  ON CONFLICT (event_slug) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Duplicate first publish overwrote settings'; END IF;

  UPDATE invitation_settings SET settings = '{"title":"Second publish"}'::jsonb,
    revision = revision + 1, updated_at = now()
    WHERE event_slug = 'oyster-roast-2026' AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Second publish failed'; END IF;

  UPDATE invitation_settings SET settings = '{"title":"Stale publish"}'::jsonb,
    revision = revision + 1 WHERE event_slug = 'oyster-roast-2026' AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale publish was accepted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM invitation_settings WHERE settings->>'title' = 'Second publish' AND revision = 2)
    THEN RAISE EXCEPTION 'Saved settings incorrect'; END IF;

  BEGIN
    INSERT INTO invitation_settings (event_slug, settings) VALUES ('other-event', '{}');
    RAISE EXCEPTION 'Unexpected event accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE invitation_settings SET settings = '[]';
    RAISE EXCEPTION 'Non-object accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE invitation_settings SET settings = jsonb_build_object('title', repeat('x', 17000));
    RAISE EXCEPTION 'Oversized data accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE invitation_settings SET revision = 0;
    RAISE EXCEPTION 'Invalid revision accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF (SELECT count(*) FROM rsvps) <> original_guests OR (SELECT count(*) FROM playlist_suggestions) <> original_songs
    THEN RAISE EXCEPTION 'Existing guest or song records changed'; END IF;
  RAISE NOTICE 'PASS: first save, duplicate protection, versioned update, stale-save rejection, schema constraints, preserved guest/song counts';
END $$;
ROLLBACK;
