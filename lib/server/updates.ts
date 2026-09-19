import "server-only";

import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import type { PublicHostUpdate } from "../updates";
import type { UpdateInput } from "./event-content-validation";

export type AdminHostUpdate = PublicHostUpdate & { id: string };

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Database access is not configured.");
  return neon(url);
}

function publicUpdate(row: Record<string, unknown>): PublicHostUpdate {
  return {
    heading: row.heading == null ? null : String(row.heading),
    message: String(row.message),
    publishedAt: new Date(row.publishedAt as string | Date).toISOString(),
  };
}

export async function listPublicHostUpdates(): Promise<PublicHostUpdate[]> {
  if (!OYSTER_ROAST_EVENT.features.updates) return [];
  const sql = database();
  const rows = await sql`
    SELECT heading, message, published_at AS "publishedAt"
    FROM event_updates
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} AND published_at IS NOT NULL
    ORDER BY published_at DESC, id DESC
  `;
  return rows.map(publicUpdate);
}

export async function listHostUpdatesForAdmin(): Promise<AdminHostUpdate[]> {
  const sql = database();
  const rows = await sql`
    SELECT id::text, heading, message, published_at AS "publishedAt"
    FROM event_updates WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY published_at DESC, id DESC
  `;
  return rows.map((row) => ({ id: String(row.id), ...publicUpdate(row) }));
}

export async function insertHostUpdate(id: string, input: UpdateInput): Promise<void> {
  const sql = database();
  await sql`
    INSERT INTO event_updates (id, event_slug, heading, message)
    VALUES (${id}::uuid, ${OYSTER_ROAST_EVENT.slug}, ${input.heading}, ${input.message})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function updateHostUpdate(id: string, input: UpdateInput): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    UPDATE event_updates SET heading = ${input.heading}, message = ${input.message}, updated_at = now()
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} AND id = ${id}::uuid
    RETURNING 1 AS updated
  `;
  return rows.length > 0;
}

export async function removeHostUpdate(id: string): Promise<void> {
  const sql = database();
  await sql`DELETE FROM event_updates WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} AND id = ${id}::uuid`;
}
