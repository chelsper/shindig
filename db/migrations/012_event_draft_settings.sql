BEGIN;

-- Private draft preferences only; no changes to live invitation/RSVP/module data.
CREATE TABLE IF NOT EXISTS event_draft_settings (
  event_id uuid PRIMARY KEY REFERENCES events(id),
  max_party_size integer NOT NULL CHECK (max_party_size BETWEEN 1 AND 20),
  allow_comments boolean NOT NULL,
  guest_list_default_visible boolean NOT NULL,
  features jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_draft_features_shape CHECK (
    jsonb_typeof(features) = 'object'
    AND features ?& ARRAY['guestList', 'playlist', 'weather', 'questions', 'updates', 'polls', 'photos', 'potluck']
    AND features - ARRAY['guestList', 'playlist', 'weather', 'questions', 'updates', 'polls', 'photos', 'potluck'] = '{}'::jsonb
    AND jsonb_typeof(features->'guestList') = 'boolean'
    AND jsonb_typeof(features->'playlist') = 'boolean'
    AND jsonb_typeof(features->'weather') = 'boolean'
    AND jsonb_typeof(features->'questions') = 'boolean'
    AND jsonb_typeof(features->'updates') = 'boolean'
    AND jsonb_typeof(features->'polls') = 'boolean'
    AND features->'photos' = 'false'::jsonb
    AND features->'potluck' = 'false'::jsonb
  )
);

COMMIT;
