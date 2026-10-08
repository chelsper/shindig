import "server-only";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { isAdminAuthenticated } from "./admin-session";
import { getEventDraft } from "./event-drafts";
import { getDraftArtwork } from "./event-draft-artwork";
import { getDraftSettings } from "./event-draft-settings";
import { getInvitationSettings } from "./invitation-settings";
import { getEventHubHeaderSettings } from "./event-hub-settings";
import { copyEventArtwork, type CopyArtworkSource } from "./duplicate-artwork";
import { validateEventDraft, type EventDraftFields } from "../event-drafts";
import { DEFAULT_DRAFT_SETTINGS, validateDraftSettings, type DraftSettings } from "../event-draft-settings";
import { resolveEventConfiguration } from "../invitation-settings";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import { EventDuplicationError, isDuplicationSource, validateDuplicateEventInput, type DuplicateEventInput } from "../event-duplication";

export type DuplicationSource = CopyArtworkSource & {
  details: EventDraftFields; settings: DraftSettings; settingsSaved: boolean; fingerprint: string;
};
function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  return neon(url);
}

export async function getDuplicationSource(key: string): Promise<DuplicationSource | null> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  if (!isDuplicationSource(key)) return null;
  key = key.toLowerCase();
  let source: Omit<DuplicationSource, "fingerprint">, versions: unknown;
  if (key === OYSTER_ROAST_EVENT.slug) {
    const [invitation, header] = await Promise.all([getInvitationSettings(), getEventHubHeaderSettings(true)]);
    const event = resolveEventConfiguration(invitation.settings);
    source = {
      key, details: { title: event.title, description: event.description, hostName: "", venue: event.venue, address: event.address, cityLabel: event.cityLabel, timeZone: event.timeZone, startsAtUtc: event.startsAtUtc, endsAtUtc: event.endsAtUtc },
      settings: { rsvp: event.rsvp ?? DEFAULT_DRAFT_SETTINGS.rsvp, features: event.features }, settingsSaved: true,
      images: { invitation: { locator: event.invitation.imageUrl, alt: event.invitation.imageAlt }, header: { locator: header.imageUrl, alt: header.imageAlt } },
      crop: { focalX: header.focalX, focalY: header.focalY, zoomPercent: header.zoomPercent },
    };
    versions = { invitation: invitation.revision };
  } else {
    const [draft, artwork, settings] = await Promise.all([getEventDraft(key), getDraftArtwork(key), getDraftSettings(key)]);
    if (!draft || !artwork || !settings) return null;
    source = {
      key, details: draft, settings: settings.settings, settingsSaved: settings.revision > 0,
      images: {
        invitation: artwork.settings.invitation.path ? { locator: artwork.settings.invitation.path, alt: artwork.settings.invitation.alt } : null,
        header: artwork.settings.header.path ? { locator: artwork.settings.header.path, alt: artwork.settings.header.alt } : null,
      },
      crop: { focalX: artwork.settings.header.focalX, focalY: artwork.settings.header.focalY, zoomPercent: artwork.settings.header.zoomPercent },
    };
    versions = { details: draft.revision, artwork: artwork.revision, settings: settings.revision };
  }
  const details = validateEventDraft(source.details), settings = validateDraftSettings(source.settings);
  if (!details.ok || !settings.ok) throw new Error("Invalid event setup.");
  source = { ...source, details: details.fields, settings: settings.settings };
  return { ...source, fingerprint: createHash("sha256").update(JSON.stringify({ source, versions })).digest("hex") };
}

type Receipt = { source: string; fingerprint: string; title: string; eventId: string | null };
async function receipt(input: DuplicateEventInput) {
  const rows = await database()`SELECT source_key AS source, source_fingerprint AS fingerprint, requested_title AS title,
    completed_event_id AS "eventId" FROM event_duplication_requests WHERE id = ${input.requestId}::uuid`;
  const saved = rows[0] as Receipt | undefined;
  if (saved && (saved.source !== input.source || saved.fingerprint !== input.fingerprint || saved.title !== input.title)) throw new EventDuplicationError("This copy request already has different details. Reopen Duplicate Event to start a separate copy.");
  return saved;
}

export async function duplicateEventRecord(value: unknown): Promise<string> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const input = validateDuplicateEventInput(value);
  if (!input) throw new EventDuplicationError("Please reopen Duplicate Event and confirm a name for the new draft.");
  const previous = await receipt(input);
  if (previous?.eventId) return previous.eventId; // Never overwrite a copied draft, even after it is edited/published.
  const source = await getDuplicationSource(input.source);
  if (!source) throw new EventDuplicationError("The source event is no longer available. Return to your events.");
  if (source.fingerprint !== input.fingerprint) throw new EventDuplicationError("The source setup changed. Reopen Duplicate Event to review the latest saved version.");
  const sql = database();
  // Bind ID + source + version + requested name before touching private storage.
  await sql`INSERT INTO event_duplication_requests (id, source_key, source_fingerprint, requested_title)
    VALUES (${input.requestId}::uuid, ${input.source}, ${input.fingerprint}, ${input.title}) ON CONFLICT (id) DO NOTHING`;
  const reserved = await receipt(input);
  if (!reserved) throw new Error("Copy reservation unavailable.");
  if (reserved.eventId) return reserved.eventId;
  const fields = validateEventDraft({ ...source.details, title: input.title, startsAtUtc: null, endsAtUtc: null });
  if (!fields.ok) throw new Error("Invalid copied details.");
  const artwork = await copyEventArtwork(input.requestId, source);
  const f = fields.fields, { rsvp, features } = source.settings;
  // One statement creates all draft rows and completes the receipt, or none.
  // Row locking serializes repeated clicks; no publication or guest table is read/written.
  const rows = await sql`WITH request AS (
      SELECT id FROM event_duplication_requests WHERE id = ${input.requestId}::uuid AND completed_event_id IS NULL
        AND source_key = ${input.source} AND source_fingerprint = ${input.fingerprint} AND requested_title = ${input.title} FOR UPDATE
    ), created AS (
      INSERT INTO events (id, status, title, description, host_name, venue, address, city_label, time_zone, starts_at, ends_at)
      SELECT id, 'draft', ${f.title}, ${f.description}, ${f.hostName}, ${f.venue}, ${f.address}, ${f.cityLabel}, ${f.timeZone}, NULL, NULL FROM request
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), artwork AS (
      INSERT INTO event_draft_artwork (event_id, settings) SELECT id, ${JSON.stringify(artwork)}::jsonb FROM created RETURNING event_id
    ), settings AS (
      INSERT INTO event_draft_settings (event_id, max_party_size, allow_comments, guest_list_default_visible, features, rsvp_deadline, guest_capacity)
      SELECT id, ${rsvp.maxPartySize}, ${rsvp.allowComments}, ${rsvp.guestListDefaultVisible}, ${JSON.stringify(features)}::jsonb, NULL, ${rsvp.capacity ?? null}::integer
      FROM created WHERE ${source.settingsSaved} RETURNING event_id
    ) UPDATE event_duplication_requests r SET completed_event_id = created.id, completed_at = now()
      FROM created, artwork WHERE r.id = created.id AND artwork.event_id = created.id
        AND (NOT ${source.settingsSaved} OR EXISTS (SELECT 1 FROM settings WHERE event_id = created.id)) RETURNING r.completed_event_id AS id`;
  if (rows[0]?.id) return rows[0].id as string;
  const completed = await receipt(input);
  if (completed?.eventId) return completed.eventId;
  throw new EventDuplicationError("This draft key is already in use. Reopen Duplicate Event to start a fresh copy.");
}
