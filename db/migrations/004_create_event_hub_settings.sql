BEGIN;

CREATE TABLE IF NOT EXISTS event_hub_settings (
  event_slug TEXT PRIMARY KEY,
  header_image_url TEXT NOT NULL,
  header_image_alt TEXT NOT NULL,
  header_focal_x SMALLINT NOT NULL,
  header_focal_y SMALLINT NOT NULL,
  header_zoom_percent SMALLINT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT event_hub_settings_event_slug_check
    CHECK (event_slug = 'oyster-roast-2026'),
  CONSTRAINT event_hub_settings_image_url_check
    CHECK (char_length(header_image_url) BETWEEN 1 AND 2048),
  CONSTRAINT event_hub_settings_image_alt_check
    CHECK (char_length(btrim(header_image_alt)) BETWEEN 1 AND 180),
  CONSTRAINT event_hub_settings_focal_x_check
    CHECK (header_focal_x BETWEEN 0 AND 100),
  CONSTRAINT event_hub_settings_focal_y_check
    CHECK (header_focal_y BETWEEN 0 AND 100),
  CONSTRAINT event_hub_settings_zoom_check
    CHECK (header_zoom_percent BETWEEN 100 AND 200)
);

COMMIT;
