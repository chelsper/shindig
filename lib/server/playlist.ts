import "server-only";

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import type { PublicPlaylistSuggestion } from "../playlist";

export type AdminPlaylistSuggestion = PublicPlaylistSuggestion & {
  id: string;
  createdAt: string;
};

function database() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Database access is not configured.");
  return neon(databaseUrl);
}

export async function listPublicPlaylistSuggestions(): Promise<PublicPlaylistSuggestion[]> {
  const sql = database();
  const rows = await sql`
    SELECT song_title AS "songTitle", artist, suggested_by AS "suggestedBy"
    FROM playlist_suggestions
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY created_at DESC, id DESC
  `;

  // Explicit projection also keeps database-only fields out of RSC/action payloads.
  return rows.map((row) => ({
    songTitle: String(row.songTitle),
    artist: String(row.artist),
    suggestedBy: row.suggestedBy == null ? null : String(row.suggestedBy),
  }));
}

export async function createPlaylistSuggestion(
  suggestion: PublicPlaylistSuggestion,
): Promise<"added" | "duplicate"> {
  const sql = database();
  const rows = await sql`
    INSERT INTO playlist_suggestions (id, event_slug, song_title, artist, suggested_by)
    VALUES (
      ${randomUUID()}, ${OYSTER_ROAST_EVENT.slug}, ${suggestion.songTitle},
      ${suggestion.artist}, ${suggestion.suggestedBy}
    )
    ON CONFLICT (event_slug, lower(btrim(song_title)), lower(btrim(artist))) DO NOTHING
    RETURNING 1 AS inserted
  `;
  return rows.length > 0 ? "added" : "duplicate";
}

export async function listPlaylistSuggestionsForAdmin(): Promise<AdminPlaylistSuggestion[]> {
  const sql = database();
  const rows = await sql`
    SELECT id::text, song_title AS "songTitle", artist,
      suggested_by AS "suggestedBy", created_at AS "createdAt"
    FROM playlist_suggestions
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY created_at DESC, id DESC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    songTitle: String(row.songTitle),
    artist: String(row.artist),
    suggestedBy: row.suggestedBy == null ? null : String(row.suggestedBy),
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}

export async function deletePlaylistSuggestion(id: string): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    DELETE FROM playlist_suggestions
    WHERE id = ${id}::uuid AND event_slug = ${OYSTER_ROAST_EVENT.slug}
    RETURNING 1 AS deleted
  `;
  return rows.length > 0;
}
