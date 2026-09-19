import "server-only";

import { neon } from "@neondatabase/serverless";
import { cache } from "react";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import {
  DEFAULT_INVITATION_SETTINGS, resolveEventConfiguration, validateInvitationSettings,
  type InvitationRecord, type InvitationSettings,
} from "../invitation-settings";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Database access is not configured.");
  return neon(url);
}

export async function getInvitationSettings(): Promise<InvitationRecord> {
  const sql = database();
  const rows = await sql`SELECT settings, revision FROM invitation_settings WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} LIMIT 1`;
  if (!rows.length) return { settings: DEFAULT_INVITATION_SETTINGS, revision: 0 };
  const validation = validateInvitationSettings(rows[0].settings);
  const revision = Number(rows[0].revision);
  if (!validation.success || !Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid saved invitation settings.");
  return { settings: validation.data, revision };
}

export async function saveInvitationSettings(settings: InvitationSettings, expectedRevision: number): Promise<number | null> {
  const validation = validateInvitationSettings(settings);
  if (!validation.success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid invitation settings.");
  const sql = database();
  const encoded = JSON.stringify(validation.data);
  // Compare-and-swap also protects simultaneous first saves (revision zero).
  const rows = expectedRevision === 0
    ? await sql`INSERT INTO invitation_settings (event_slug, settings) VALUES (${OYSTER_ROAST_EVENT.slug}, ${encoded}::jsonb)
        ON CONFLICT (event_slug) DO NOTHING RETURNING revision`
    : await sql`UPDATE invitation_settings SET settings = ${encoded}::jsonb, revision = revision + 1, updated_at = now()
        WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} AND revision = ${expectedRevision} RETURNING revision`;
  return rows.length ? Number(rows[0].revision) : null;
}

// React cache deduplicates within a render/request only; it cannot keep old
// published details alive across requests. Never silently use old event dates
// when an actual database read fails.
export const getEventConfiguration = cache(async () => {
  if (!process.env.DATABASE_URL?.trim()) return resolveEventConfiguration(DEFAULT_INVITATION_SETTINGS);
  return resolveEventConfiguration((await getInvitationSettings()).settings);
});
