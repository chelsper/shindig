import "server-only";
import { neon } from "@neondatabase/serverless";
import { isHostAuthenticated } from "./host-access";
import { getEventDraft } from "./event-drafts";
import { isDraftId, isDraftRevision } from "../event-drafts";
import { DEFAULT_DRAFT_SETTINGS, validateDraftSettings, type DraftSettingsRecord } from "../event-draft-settings";

async function database() {
  if (!(await isHostAuthenticated())) throw new Error("Host access required.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Draft storage is not configured.");
  return neon(url);
}

export async function getDraftSettings(id: string): Promise<DraftSettingsRecord | null> {
  const sql = await database();
  if (!isDraftId(id) || !(await getEventDraft(id))) return null;
  const rows = await sql`SELECT max_party_size AS "maxPartySize", allow_comments AS "allowComments",
    guest_list_default_visible AS "guestListDefaultVisible", rsvp_deadline AS "deadlineAtUtc", guest_capacity AS capacity, features, revision
    FROM event_draft_settings WHERE event_id = ${id}::uuid`;
  if (!rows.length) return { settings: structuredClone(DEFAULT_DRAFT_SETTINGS), revision: 0 };
  const row = rows[0];
  const parsed = validateDraftSettings({ rsvp: { maxPartySize: row.maxPartySize, allowComments: row.allowComments, guestListDefaultVisible: row.guestListDefaultVisible, deadlineAtUtc: row.deadlineAtUtc ? new Date(row.deadlineAtUtc).toISOString() : null, capacity: row.capacity ?? null }, features: row.features });
  if (!parsed.ok || !isDraftRevision(row.revision) || row.revision < 1) throw new Error("Invalid draft settings.");
  return { settings: parsed.settings, revision: row.revision };
}

export async function saveDraftSettingsRecord(id: string, revision: number, input: unknown): Promise<number | null> {
  const sql = await database();
  const parsed = validateDraftSettings(input);
  if (!isDraftId(id) || !isDraftRevision(revision) || !parsed.ok) throw new Error("Invalid draft settings.");
  if (!(await getEventDraft(id))) return null;
  const { rsvp, features } = parsed.settings;
  if (revision === 0) {
    const rows = await sql`INSERT INTO event_draft_settings (event_id, max_party_size, allow_comments, guest_list_default_visible, features, rsvp_deadline, guest_capacity)
      SELECT id, ${rsvp.maxPartySize}, ${rsvp.allowComments}, ${rsvp.guestListDefaultVisible}, ${JSON.stringify(features)}::jsonb, ${rsvp.deadlineAtUtc ?? null}::timestamptz, ${rsvp.capacity ?? null}::integer
      FROM events WHERE id = ${id}::uuid AND status = 'draft'
      ON CONFLICT (event_id) DO NOTHING RETURNING revision`;
    return rows[0]?.revision ?? null;
  }
  const rows = await sql`UPDATE event_draft_settings SET max_party_size = ${rsvp.maxPartySize}, allow_comments = ${rsvp.allowComments},
    guest_list_default_visible = ${rsvp.guestListDefaultVisible}, features = ${JSON.stringify(features)}::jsonb,
    rsvp_deadline = ${rsvp.deadlineAtUtc ?? null}::timestamptz, guest_capacity = ${rsvp.capacity ?? null}::integer,
    revision = revision + 1, updated_at = now()
    WHERE event_id = ${id}::uuid AND revision = ${revision}
      AND EXISTS (SELECT 1 FROM events WHERE id = ${id}::uuid AND status = 'draft') RETURNING revision`;
  return rows[0]?.revision ?? null;
}
