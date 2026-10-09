import "server-only";
import { neon } from "@neondatabase/serverless";
import { head } from "@vercel/blob";
import { isHostAuthenticated } from "./host-access";
import { getEventDraft } from "./event-drafts";
import { isDraftRevision } from "../event-drafts";
import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_TYPES, EMPTY_DRAFT_ARTWORK, validateDraftArtwork, type DraftArtworkRecord } from "../event-draft-artwork";

export function draftImageStorageToken() { return process.env.EVENT_DRAFT_BLOB_READ_WRITE_TOKEN?.trim(); }
async function database() {
  if (!(await isHostAuthenticated())) throw new Error("Host access required.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Draft storage is not configured.");
  return neon(url);
}
export async function getDraftArtwork(id: string): Promise<DraftArtworkRecord | null> {
  const sql = await database();
  if (!(await getEventDraft(id))) return null;
  const rows = await sql`SELECT settings, revision FROM event_draft_artwork WHERE event_id = ${id}::uuid`;
  if (!rows.length) return { settings: structuredClone(EMPTY_DRAFT_ARTWORK), revision: 0 };
  const parsed = validateDraftArtwork(id, rows[0].settings);
  if (!parsed.ok || !isDraftRevision(rows[0].revision) || rows[0].revision < 1) throw new Error("Invalid draft artwork.");
  return { settings: parsed.settings, revision: rows[0].revision };
}
export async function saveDraftArtworkRecord(id: string, revision: number, input: unknown): Promise<number | null> {
  const sql = await database();
  const result = validateDraftArtwork(id, input);
  if (!result.ok || !isDraftRevision(revision)) throw new Error("Invalid draft artwork.");
  if (!(await getEventDraft(id))) return null;
  // Resolve only server-generated paths in this draft's private store. Never fetch
  // a browser-supplied URL or accept an image from another draft/live event.
  for (const image of [result.settings.invitation, result.settings.header]) {
    if (!image.path) continue;
    const token = draftImageStorageToken();
    if (!token) throw new Error("Private image storage is not configured.");
    const blob = await head(image.path, { token });
    if (blob.pathname !== image.path || !new URL(blob.url).hostname.endsWith(".private.blob.vercel-storage.com") || blob.size > DRAFT_IMAGE_LIMIT || !DRAFT_IMAGE_TYPES.some((type) => type === blob.contentType)) throw new Error("Invalid private image.");
  }
  if (revision === 0) {
    const rows = await sql`INSERT INTO event_draft_artwork (event_id, settings)
      SELECT id, ${JSON.stringify(result.settings)}::jsonb FROM events WHERE id = ${id}::uuid AND status = 'draft'
      ON CONFLICT (event_id) DO NOTHING RETURNING revision`;
    return rows[0]?.revision ?? null;
  }
  const updated = await sql`UPDATE event_draft_artwork SET settings = ${JSON.stringify(result.settings)}::jsonb, revision = revision + 1, updated_at = now()
    WHERE event_id = ${id}::uuid AND revision = ${revision}
      AND EXISTS (SELECT 1 FROM events WHERE id = ${id}::uuid AND status = 'draft') RETURNING revision`;
  return updated[0]?.revision ?? null;
}
