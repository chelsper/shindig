import "server-only";
import { neon } from "@neondatabase/serverless";
import { parseEventLocation } from "../event-location";
import { isAdminAuthenticated } from "./admin-session";
import { isDraftId, isDraftRevision, validateEventDraft, type EventDraft, type EventDraftFields, type EventDraftSummary } from "../event-drafts";

async function adminDatabase() {
  // Protect the data layer as well as the pages/actions. UUIDs are not access tokens.
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Draft storage is not configured.");
  return neon(url);
}
const timestamp = (value: unknown) => {
  if (typeof value !== "string" && !(value instanceof Date)) throw new Error("Invalid draft timestamp.");
  return new Date(value).toISOString();
};
function readDraft(row: Record<string, unknown>): EventDraft {
  const parsed = validateEventDraft({ ...row, startsAtUtc: row.startsAtUtc === null ? null : timestamp(row.startsAtUtc), endsAtUtc: row.endsAtUtc === null ? null : timestamp(row.endsAtUtc) });
  if (!parsed.ok || !isDraftId(row.id) || !isDraftRevision(row.revision) || row.revision < 1 || row.status !== "draft") throw new Error("Invalid draft record.");
  const location = parseEventLocation(row.location, parsed.fields.address);
  if (row.location != null && !location) throw new Error("Invalid saved location.");
  return { ...parsed.fields, id: row.id, status: "draft", revision: row.revision, createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt), location };
}

export async function listEventDrafts(): Promise<EventDraftSummary[]> {
  const sql = await adminDatabase();
  const rows = await sql`SELECT id, title, starts_at AS "startsAtUtc", time_zone AS "timeZone", city_label AS "cityLabel", updated_at AS "updatedAt"
    FROM events WHERE status = 'draft' ORDER BY updated_at DESC, id`;
  return rows.map((row) => ({ id: row.id as string, title: row.title as string, startsAtUtc: row.startsAtUtc === null ? null : timestamp(row.startsAtUtc), timeZone: row.timeZone as string, cityLabel: row.cityLabel as string, updatedAt: timestamp(row.updatedAt) }));
}

export async function getEventDraft(id: string): Promise<EventDraft | null> {
  const sql = await adminDatabase();
  if (!isDraftId(id)) return null;
  const rows = await sql`SELECT id, status, title, description, host_name AS "hostName", venue, address, city_label AS "cityLabel",
    time_zone AS "timeZone", starts_at AS "startsAtUtc", ends_at AS "endsAtUtc", revision, created_at AS "createdAt", updated_at AS "updatedAt", location_confirmation AS location
    FROM events WHERE id = ${id}::uuid AND status = 'draft' LIMIT 1`;
  return rows.length ? readDraft(rows[0]) : null;
}

export async function saveEventDraftRecord(id: string, revision: number, input: EventDraftFields): Promise<{ id: string; revision: number } | null> {
  const sql = await adminDatabase();
  const parsed = validateEventDraft(input);
  if (!isDraftId(id) || !isDraftRevision(revision) || !parsed.ok) throw new Error("Invalid event draft.");
  const f = parsed.fields;
  if (revision === 0) {
    const rows = await sql`INSERT INTO events (id, status, title, description, host_name, venue, address, city_label, time_zone, starts_at, ends_at)
      VALUES (${id}::uuid, 'draft', ${f.title}, ${f.description}, ${f.hostName}, ${f.venue}, ${f.address}, ${f.cityLabel}, ${f.timeZone}, ${f.startsAtUtc}::timestamptz, ${f.endsAtUtc}::timestamptz)
      ON CONFLICT (id) DO NOTHING RETURNING id, revision`;
    if (rows.length) return { id: rows[0].id, revision: rows[0].revision };
    // A retry after a lost response can acknowledge the identical saved draft,
    // but never overwrite a newer/different draft using the creation request.
    const existing = await getEventDraft(id);
    const saved = existing && validateEventDraft(existing);
    return existing && saved?.ok && JSON.stringify(saved.fields) === JSON.stringify(f) ? { id: existing.id, revision: existing.revision } : null;
  }
  const rows = await sql`UPDATE events SET title = ${f.title}, description = ${f.description}, host_name = ${f.hostName},
    venue = ${f.venue}, address = ${f.address}, city_label = ${f.cityLabel}, time_zone = ${f.timeZone},
    starts_at = ${f.startsAtUtc}::timestamptz, ends_at = ${f.endsAtUtc}::timestamptz, revision = revision + 1, updated_at = now()
    WHERE id = ${id}::uuid AND status = 'draft' AND revision = ${revision} RETURNING id, revision`;
  return rows.length ? { id: rows[0].id, revision: rows[0].revision } : null;
}
