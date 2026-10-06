import "server-only";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_SCOPE, eventScopeSlug, eventFeatureEnabled, requireEventFeature, type EventScope } from "./event-scope";
function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Database access is not configured.");
  return neon(url);
}
export async function listGuestApplause(hash: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<string[]> {
  const eventSlug = eventScopeSlug(scope);
  if (!eventFeatureEnabled(scope, "playlist")) return [];
  const sql = database();
  const rows = await sql`SELECT s.public_key AS key FROM playlist_applause a
    JOIN playlist_suggestions s ON s.id = a.playlist_suggestion_id
    WHERE a.event_slug = ${eventSlug} AND a.voter_token_hash = ${hash}`;
  return rows.map((row) => String(row.key));
}
export async function setPlaylistApplause(key: string, active: boolean, hash: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<number | null> {
  const eventSlug = eventScopeSlug(scope);
  requireEventFeature(scope, "playlist");
  const sql = database();
  const rows = await sql`SELECT shindig_set_applause(${eventSlug}, ${key}::uuid, ${hash}, ${active}) AS count`;
  return rows[0]?.count == null ? null : Number(rows[0].count);
}
