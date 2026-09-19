import "server-only";

import { neon } from "@neondatabase/serverless";

import {
  DEFAULT_EVENT_HUB_HEADER,
  type EventHubHeaderSettings,
  validateEventHubHeaderSettings,
} from "../event-hub-settings";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";

const EVENT_SLUG = OYSTER_ROAST_EVENT.slug;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Database access is not configured.");
  return databaseUrl;
}

export async function getEventHubHeaderSettings(): Promise<EventHubHeaderSettings> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    SELECT
      header_image_url AS "imageUrl",
      header_image_alt AS "imageAlt",
      header_focal_x::int AS "focalX",
      header_focal_y::int AS "focalY",
      header_zoom_percent::int AS "zoomPercent"
    FROM event_hub_settings
    WHERE event_slug = ${EVENT_SLUG}
    LIMIT 1
  `;

  const savedSettings = rows[0] as EventHubHeaderSettings | undefined;
  if (!savedSettings) return DEFAULT_EVENT_HUB_HEADER;

  const validation = validateEventHubHeaderSettings(savedSettings);
  return validation.success ? validation.data : DEFAULT_EVENT_HUB_HEADER;
}

export async function saveEventHubHeaderSettings(
  settings: EventHubHeaderSettings,
): Promise<void> {
  const sql = neon(getDatabaseUrl());
  await sql`
    INSERT INTO event_hub_settings (
      event_slug,
      header_image_url,
      header_image_alt,
      header_focal_x,
      header_focal_y,
      header_zoom_percent,
      updated_at
    )
    VALUES (
      ${EVENT_SLUG},
      ${settings.imageUrl},
      ${settings.imageAlt},
      ${settings.focalX},
      ${settings.focalY},
      ${settings.zoomPercent},
      now()
    )
    ON CONFLICT (event_slug) DO UPDATE SET
      header_image_url = EXCLUDED.header_image_url,
      header_image_alt = EXCLUDED.header_image_alt,
      header_focal_x = EXCLUDED.header_focal_x,
      header_focal_y = EXCLUDED.header_focal_y,
      header_zoom_percent = EXCLUDED.header_zoom_percent,
      updated_at = now()
  `;
}
