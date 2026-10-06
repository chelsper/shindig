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

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  return neon(url);
}
export type EventPublication = { id: string; slug: string; snapshot: PublicationSnapshot; revision: number; publishedAt: string };

// The public resolver reads this table ONLY, never mutable drafts. No credentials
// or private artwork paths are exposed by pages: those use publicationEvent().
export async function getEventPublication(slug: string): Promise<EventPublication | null> {
  if (!slug.startsWith("event-") || !isDraftId(slug.slice(6)) || slug !== slug.toLowerCase()) return null;
  if (!process.env.DATABASE_URL?.trim()) return null;
  const rows = await database()`SELECT event_id AS id, slug, snapshot, revision, published_at AS "publishedAt"
    FROM event_publications WHERE slug = ${slug} LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  if (row.slug !== slug || draftEventSlug(row.id) !== slug || !isDraftRevision(row.revision) || row.revision < 1) throw new Error("Invalid publication.");
  return { id: row.id, slug, snapshot: parsePublicationSnapshot(row.id, row.snapshot), revision: row.revision, publishedAt: new Date(row.publishedAt).toISOString() };
}
export async function getPublishedEvent(slug: string) {
  const publication = await getEventPublication(slug);
  return publication ? publicationEvent(publication.id, publication.snapshot) : null;
}
export async function listHostPublications() {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const rows = await database()`SELECT event_id AS id, slug, snapshot->'details'->>'title' AS title, published_at AS "publishedAt"
    FROM event_publications ORDER BY published_at DESC`;
  return rows.map((row) => ({ id: String(row.id), slug: String(row.slug), title: String(row.title), publishedAt: new Date(row.publishedAt).toISOString() }));
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
      revision = event_publications.revision + 1, published_at = now()
      WHERE event_publications.revision = ${versions.publication}
    RETURNING revision`;
  if (rows.length) return rows[0].revision as number;
  // Lost-response/double-click retry acknowledges exactly the same publication,
  // never overwrites a different or newer one.
  const current = await getEventPublication(slug);
  return current?.revision === versions.publication + 1 && JSON.stringify(current.snapshot) === JSON.stringify(snapshot) ? current.revision : null;
}
