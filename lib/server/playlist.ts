import "server-only";

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import type { CatalogSuggestion, PublicPlaylistSuggestion } from "../playlist";
import { musicAttribution } from "./music";

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
    SELECT public_key AS key, provider, provider_track_id AS "providerTrackId", song_title AS "songTitle", artist,
      album, artwork_url AS "artworkUrl", external_url AS "externalUrl", explicit, suggested_by AS "suggestedBy",
      (SELECT count(*)::integer FROM playlist_applause a WHERE a.playlist_suggestion_id = s.id) AS "applauseCount"
    FROM playlist_suggestions s
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY created_at DESC, id DESC
  `;

  // Explicit projection also keeps database-only fields out of RSC/action payloads.
  return rows.map((row, index) => publicSuggestion(row, index));
}

function publicSuggestion(row: Record<string, unknown>, newestRank: number): PublicPlaylistSuggestion {
  const provider = row.provider == null ? null : String(row.provider);
  return {
    key: String(row.key), applauseCount: Number(row.applauseCount ?? 0), newestRank,
    provider,
    providerTrackId: row.providerTrackId == null ? null : String(row.providerTrackId),
    songTitle: String(row.songTitle),
    artist: String(row.artist),
    album: row.album == null ? null : String(row.album),
    artworkUrl: row.artworkUrl == null ? null : String(row.artworkUrl),
    externalUrl: row.externalUrl == null ? null : String(row.externalUrl),
    explicit: typeof row.explicit === "boolean" ? row.explicit : null,
    attribution: musicAttribution(provider),
    suggestedBy: row.suggestedBy == null ? null : String(row.suggestedBy),
  };
}

export async function createPlaylistSuggestion(
  suggestion: CatalogSuggestion,
): Promise<"added" | "duplicate"> {
  const sql = database();
  const rows = await sql`
    INSERT INTO playlist_suggestions (id, event_slug, provider, provider_track_id,
      song_title, artist, album, artwork_url, external_url, explicit, suggested_by)
    VALUES (
      ${randomUUID()}, ${OYSTER_ROAST_EVENT.slug}, ${suggestion.provider}, ${suggestion.providerTrackId},
      ${suggestion.songTitle}, ${suggestion.artist}, ${suggestion.album}, ${suggestion.artworkUrl},
      ${suggestion.externalUrl}, ${suggestion.explicit}, ${suggestion.suggestedBy}
    )
    ON CONFLICT (event_slug, provider, provider_track_id) WHERE provider IS NOT NULL DO NOTHING
    RETURNING 1 AS inserted
  `;
  return rows.length > 0 ? "added" : "duplicate";
}

export async function listPlaylistSuggestionsForAdmin(): Promise<AdminPlaylistSuggestion[]> {
  const sql = database();
  const rows = await sql`
    SELECT id::text, public_key AS key, provider, provider_track_id AS "providerTrackId", song_title AS "songTitle", artist,
      album, artwork_url AS "artworkUrl", external_url AS "externalUrl", explicit,
      suggested_by AS "suggestedBy", created_at AS "createdAt",
      (SELECT count(*)::integer FROM playlist_applause a WHERE a.playlist_suggestion_id = s.id) AS "applauseCount"
    FROM playlist_suggestions s
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY created_at DESC, id DESC
  `;
  return rows.map((row, index) => ({
    ...publicSuggestion(row, index),
    id: String(row.id),
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
