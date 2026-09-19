import "server-only";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Database access is not configured.");
  return neon(url);
}
export async function listGuestApplause(hash: string): Promise<string[]> {
  const sql = database();
  const rows = await sql`SELECT s.public_key AS key FROM playlist_applause a
    JOIN playlist_suggestions s ON s.id = a.playlist_suggestion_id
    WHERE a.event_slug = ${OYSTER_ROAST_EVENT.slug} AND a.voter_token_hash = ${hash}`;
  return rows.map((row) => String(row.key));
}
export async function setPlaylistApplause(key: string, active: boolean, hash: string): Promise<number | null> {
  const sql = database();
  const rows = await sql`SELECT shindig_set_applause(${OYSTER_ROAST_EVENT.slug}, ${key}::uuid, ${hash}, ${active}) AS count`;
  return rows[0]?.count == null ? null : Number(rows[0].count);
}
