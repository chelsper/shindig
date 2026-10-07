import "server-only";
import { neon } from "@neondatabase/serverless";
import { head } from "@vercel/blob";
import { isAdminAuthenticated } from "./admin-session";
import { getEventDraft } from "./event-drafts";
import { getDraftArtwork, draftImageStorageToken } from "./event-draft-artwork";
import { getDraftSettings } from "./event-draft-settings";
import { isDraftId, isDraftRevision } from "../event-drafts";
import { draftEventSlug } from "../event-routes";
import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_TYPES } from "../event-draft-artwork";
import { parsePublicationSnapshot, publicationEvent, type PublicationSnapshot, type PublicationVersions } from "../event-publication";
import { hasUnpublishedChanges, isLifecycleAction, type EventLifecycle, type LifecycleAction } from "../event-lifecycle";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  return neon(url);
}
export type EventPublication = EventLifecycle & { id: string; slug: string; snapshot: PublicationSnapshot; revision: number; publishedAt: string; sourceRevisions: PublicationVersions };

function validSlug(slug: string) {
  return typeof slug === "string" && slug.startsWith("event-") && isDraftId(slug.slice(6)) && slug === slug.toLowerCase();
}
function parsePublication(row: Record<string, unknown>, slug: string): EventPublication {
  const source = row.sourceRevisions as PublicationVersions | undefined;
  if (row.slug !== slug || typeof row.id !== "string" || draftEventSlug(row.id) !== slug || !isDraftRevision(row.revision) || row.revision < 1 ||
      !["published", "unpublished"].includes(String(row.visibility)) || typeof row.rsvpsOpen !== "boolean" || !source ||
      ![source.details, source.artwork, source.settings, source.publication].every(isDraftRevision)) throw new Error("Invalid publication.");
  return { id: row.id, slug, snapshot: parsePublicationSnapshot(row.id, row.snapshot), revision: row.revision,
    publishedAt: new Date(row.publishedAt as string).toISOString(), sourceRevisions: source,
    visibility: row.visibility as EventLifecycle["visibility"], rsvpsOpen: row.rsvpsOpen };
}

// The public resolver reads this table ONLY, never mutable drafts. No credentials
// or private artwork paths are exposed by pages: those use publicationEvent().
export async function getEventPublication(slug: string): Promise<EventPublication | null> {
  if (!validSlug(slug)) return null;
  if (!process.env.DATABASE_URL?.trim()) return null;
  const rows = await database()`SELECT event_id AS id, slug, snapshot, revision, published_at AS "publishedAt",
    source_revisions AS "sourceRevisions", visibility, rsvps_open AS "rsvpsOpen"
    FROM event_publications WHERE slug = ${slug} AND visibility = 'published' LIMIT 1`;
  if (!rows.length) return null;
  const publication = parsePublication(rows[0], slug);
  return publication.visibility === "published" ? publication : null;
}
// Separate authenticated entry point: public callers cannot opt into inactive data.
export async function getHostEventPublication(slug: string): Promise<EventPublication | null> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  if (!validSlug(slug)) return null;
  const rows = await database()`SELECT event_id AS id, slug, snapshot, revision, published_at AS "publishedAt",
    source_revisions AS "sourceRevisions", visibility, rsvps_open AS "rsvpsOpen"
    FROM event_publications WHERE slug = ${slug} LIMIT 1`;
  return rows.length ? parsePublication(rows[0], slug) : null;
}
export async function getPublishedEvent(slug: string) {
  const publication = await getEventPublication(slug);
  return publication ? publicationEvent(publication.id, publication.snapshot, publication.rsvpsOpen) : null;
}
export async function listHostPublications() {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const rows = await database()`SELECT p.event_id AS id, p.slug, p.snapshot->'details'->>'title' AS title, p.published_at AS "publishedAt",
      p.visibility, p.rsvps_open AS "rsvpsOpen", p.source_revisions AS "sourceRevisions",
      e.revision AS details, coalesce(a.revision, 0) AS artwork, s.revision AS settings
    FROM event_publications p JOIN events e ON e.id = p.event_id
    JOIN event_draft_settings s ON s.event_id = p.event_id LEFT JOIN event_draft_artwork a ON a.event_id = p.event_id
    ORDER BY p.published_at DESC`;
  return rows.map((row) => ({ id: String(row.id), slug: String(row.slug), title: String(row.title), publishedAt: new Date(row.publishedAt).toISOString(),
    visibility: row.visibility as EventLifecycle["visibility"], rsvpsOpen: row.rsvpsOpen as boolean,
    hasUnpublishedChanges: hasUnpublishedChanges({ details: row.details, artwork: row.artwork, settings: row.settings }, row.sourceRevisions) }));
}

export async function changeEventLifecycleRecord(id: string, revision: number, action: LifecycleAction) {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  if (!isDraftId(id) || !isDraftRevision(revision) || revision < 1 || !isLifecycleAction(action)) throw new Error("Please refresh the event controls.");
  // Explicit desired states, never toggles. A stale page cannot reverse a newer
  // host decision; the same revision also protects the publish review.
  const rows = await database()`UPDATE event_publications SET
      visibility = CASE WHEN ${action} = 'unpublish' THEN 'unpublished' ELSE visibility END,
      rsvps_open = CASE WHEN ${action} = 'close-rsvps' THEN false WHEN ${action} = 'reopen-rsvps' THEN true ELSE rsvps_open END,
      revision = revision + 1
    WHERE event_id = ${id}::uuid AND revision = ${revision}
      AND ((${action} = 'unpublish' AND visibility = 'published') OR
        (${action} = 'close-rsvps' AND rsvps_open) OR (${action} = 'reopen-rsvps' AND NOT rsvps_open))
    RETURNING revision`;
  return rows.length ? rows[0].revision as number : null;
}

export async function publishEventRecord(id: string, versions: PublicationVersions, coordinates: unknown) {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  if (!isDraftId(id) || !versions || ![versions.details, versions.artwork, versions.settings, versions.publication].every(isDraftRevision) || versions.settings < 1) throw new Error("Please refresh the review.");
  const [draft, art, settings] = await Promise.all([getEventDraft(id), getDraftArtwork(id), getDraftSettings(id)]);
  if (!draft || !art || !settings || draft.revision !== versions.details || art.revision !== versions.artwork || settings.revision !== versions.settings) return null;
  const snapshot = parsePublicationSnapshot(id, { details: draft, artwork: art.settings, settings: settings.settings, coordinates });
  for (const image of [snapshot.artwork.invitation, snapshot.artwork.header]) {
    if (!image.path) continue;
    const token = draftImageStorageToken();
    if (!token) throw new Error("Private artwork storage is unavailable.");
    const blob = await head(image.path, { token });
    if (blob.pathname !== image.path || !new URL(blob.url).hostname.endsWith(".private.blob.vercel-storage.com") || blob.size > DRAFT_IMAGE_LIMIT || !DRAFT_IMAGE_TYPES.some((t) => t === blob.contentType)) throw new Error("Artwork is unavailable.");
  }
  const sql = database(), slug = draftEventSlug(id);
  // One atomic statement checks all reviewed revisions and the previous live
  // revision. A concurrent save/re-publish cannot silently replace this review.
  const rows = await sql`INSERT INTO event_publications (event_id, slug, snapshot, source_revisions)
    SELECT e.id, ${slug}, ${JSON.stringify(snapshot)}::jsonb, ${JSON.stringify(versions)}::jsonb
    FROM events e JOIN event_draft_settings s ON s.event_id = e.id
    LEFT JOIN event_draft_artwork a ON a.event_id = e.id
    LEFT JOIN event_publications p ON p.event_id = e.id
    WHERE e.id = ${id}::uuid AND e.status = 'draft' AND e.revision = ${versions.details}
      AND s.revision = ${versions.settings} AND coalesce(a.revision, 0) = ${versions.artwork}
      AND coalesce(p.revision, 0) = ${versions.publication}
    ON CONFLICT (event_id) DO UPDATE SET snapshot = EXCLUDED.snapshot, source_revisions = EXCLUDED.source_revisions,
      revision = event_publications.revision + 1, published_at = now(), visibility = 'published'
      WHERE event_publications.revision = ${versions.publication}
    RETURNING revision`;
  if (rows.length) return rows[0].revision as number;
  // Lost-response/double-click retry acknowledges exactly the same publication,
  // never overwrites a different or newer one.
  const current = await getHostEventPublication(slug);
  return current?.visibility === "published" && current.revision === versions.publication + 1 &&
    (Object.keys(versions) as Array<keyof PublicationVersions>).every((key) => current.sourceRevisions[key] === versions[key]) &&
    JSON.stringify(current.snapshot) === JSON.stringify(snapshot) ? current.revision : null;
}
