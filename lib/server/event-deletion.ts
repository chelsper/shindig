import "server-only";
import { neon } from "@neondatabase/serverless";
import { list, del } from "@vercel/blob";
import { requireHostPrincipal } from "./host-access";
import { draftImageStorageToken } from "./event-draft-artwork";
import { isDraftId } from "../event-drafts";
import { isDraftImagePath } from "../event-draft-artwork";
import { parseDeletionInput, type DeletionReceipt, type DeletionReview } from "../event-deletion";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage unavailable.");
  return neon(url);
}
function receipt(row: Record<string, unknown>): DeletionReceipt {
  return { id: String(row.id), deletedAt: new Date(row.deletedAt as string).toISOString(),
    artworkCleanedAt: row.artworkCleanedAt ? new Date(row.artworkCleanedAt as string).toISOString() : null,
    cleanupReady: row.cleanupReady === true };
}
export async function getEventDeletionReview(id: string): Promise<DeletionReview | null> {
  const principal = await requireHostPrincipal();
  if (!isDraftId(id)) return null;
  const rows = await database()`SELECT e.id,e.title,e.revision AS details,coalesce(a.revision,0) AS artwork,
    coalesce(s.revision,0) AS settings,coalesce(p.revision,0) AS publication,p.visibility
    FROM events e LEFT JOIN event_draft_artwork a ON a.event_id=e.id
    LEFT JOIN event_draft_settings s ON s.event_id=e.id LEFT JOIN event_publications p ON p.event_id=e.id
    WHERE e.id=${id}::uuid AND e.owner_host_id IS NOT DISTINCT FROM ${principal.ownerId}::text`;
  return rows.length ? rows[0] as DeletionReview : null;
}
export async function getEventDeletionReceipt(id: string): Promise<DeletionReceipt | null> {
  const principal = await requireHostPrincipal();
  if (!isDraftId(id)) return null;
  const rows = await database()`SELECT event_id AS id,deleted_at AS "deletedAt",artwork_cleanup_at AS "artworkCleanedAt",
    deleted_at < now() - interval '3 minutes' AS "cleanupReady" FROM event_deletions
    WHERE event_id=${id}::uuid AND ((${principal.ownerId}::text IS NULL AND legacy_workspace) OR owner_host_id=${principal.ownerId}::text)`;
  return rows.length ? receipt(rows[0]) : null;
}
export async function listPendingEventDeletions(): Promise<DeletionReceipt[]> {
  const principal = await requireHostPrincipal();
  const rows = await database()`SELECT event_id AS id,deleted_at AS "deletedAt",artwork_cleanup_at AS "artworkCleanedAt",
    deleted_at < now() - interval '3 minutes' AS "cleanupReady" FROM event_deletions
    WHERE artwork_cleanup_at IS NULL AND ((${principal.ownerId}::text IS NULL AND legacy_workspace) OR owner_host_id=${principal.ownerId}::text)
    ORDER BY deleted_at DESC LIMIT 100`;
  return rows.map(receipt);
}
export async function deleteOwnedEvent(value: unknown) {
  const principal = await requireHostPrincipal();
  const input = parseDeletionInput(value);
  if (!input) throw new Error("Confirm deletion first.");
  const rows = await database()`SELECT shindig_delete_owned_event(${input.id}::uuid,${principal.ownerId}::text,
    ${input.title},${input.details}::int,${input.artwork}::int,${input.settings}::int,${input.publication}::int) AS result`;
  const status = rows[0]?.result?.status;
  if (status !== "deleted") return status === "stale" ? "stale" as const : "missing" as const;
  const saved = await getEventDeletionReceipt(input.id);
  if (!saved) throw new Error("Deletion receipt unavailable.");
  return saved;
}

// Called only by an authenticated owner, never a guest or arbitrary URL/prefix.
// A 3-minute settling period exceeds the 120-second upload/copy route limits.
// The durable receipt survives provider failures, lost responses and page reloads.
export async function cleanupDeletedEventArtwork(id: string): Promise<DeletionReceipt | null> {
  const principal = await requireHostPrincipal();
  const saved = await getEventDeletionReceipt(id);
  if (!saved || saved.artworkCleanedAt || !saved.cleanupReady) return saved;
  // PostgreSQL normalizes UUIDs; storage paths are case-sensitive. Always use
  // the authorized receipt's canonical ID, never the caller's spelling.
  id = saved.id;
  const token = draftImageStorageToken();
  if (!token) throw new Error("Artwork cleanup is unavailable.");
  // Restart from the beginning after each delete. Never skip files by advancing
  // a cursor through a changing list. Bound work; larger jobs remain retryable.
  for (let batch = 0; batch < 5; batch++) {
    const result = await list({ prefix: `event-drafts/${id}/`, limit: 100, token, abortSignal: AbortSignal.timeout(10000) });
    if (!result.blobs.length) {
      if (result.hasMore) throw new Error("Unexpected artwork listing.");
      await database()`UPDATE event_deletions SET artwork_cleanup_at=coalesce(artwork_cleanup_at,now())
        WHERE event_id=${id}::uuid AND ((${principal.ownerId}::text IS NULL AND legacy_workspace) OR owner_host_id=${principal.ownerId}::text)`;
      return getEventDeletionReceipt(id);
    }
    if (result.blobs.some(blob => !isDraftImagePath(id, blob.pathname) ||
      !/^https:\/\/[a-z0-9-]+\.private\.blob\.vercel-storage\.com\//.test(blob.url) || new URL(blob.url).pathname !== `/${blob.pathname}`)) throw new Error("Unexpected artwork scope.");
    await del(result.blobs.map(blob => blob.url), { token, abortSignal: AbortSignal.timeout(10000) });
  }
  return saved;
}
