import "server-only";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_SCOPE, eventScopeSlug, requireHostEventScope, type EventScope } from "./event-scope";
import { EMPTY_CONTACT_PREFERENCES, validateContactPreferences, type ContactPreferences, type GuestContactPreferences } from "../rsvp-contacts";
import type { ValidatedRsvpUpdate } from "./rsvp-validation";
import type { SavedRsvp } from "./rsvps";
import { RsvpAdmissionError, RSVP_CAPACITY_MESSAGE, RSVP_DEADLINE_MESSAGE } from "../rsvp-policy";
import { RSVP_CLOSED_MESSAGE } from "../event-lifecycle";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Contact storage unavailable.");
  return neon(url);
}
function checked(input: ContactPreferences) {
  const result = validateContactPreferences(input);
  if (!result.success) throw new RsvpAdmissionError(result.message);
  return result.data;
}
function contactError(status: string | undefined): never {
  if (status === "contacts-closed") throw new RsvpAdmissionError("The host has finished collecting contact details. Uncheck text and email updates, then save again.");
  if (status === "contacts-changed") throw new RsvpAdmissionError("Your update preferences changed in another session. Refresh this page before saving again.");
  throw new Error("Contact preferences could not be saved.");
}

// Only a non-personal availability bit may be used by the invitation renderer.
export async function contactCollectionClosed(eventSlug: string): Promise<boolean> {
  const sql = database();
  const rows = await sql`SELECT collection_closed AS closed FROM event_contact_settings WHERE event_slug=${eventSlug}`;
  return rows[0]?.closed === true;
}

export async function writeGuestRsvpWithContacts(scope: EventScope, operation: "guest-create" | "guest-update", id: string | null, hash: string, fields: ValidatedRsvpUpdate) {
  const slug = eventScopeSlug(scope);
  if (!fields.contactPreferences) throw new Error("Missing preferences.");
  const contacts = checked(fields.contactPreferences);
  const sql = database();
  let rows;
  try {
    rows = await sql`SELECT shindig_write_guest_rsvp_with_contacts(${slug},${operation},${id}::uuid,${hash},
      ${fields.guestName},${fields.attending}::boolean,${fields.partySize}::integer,
      ${fields.displayOnGuestList}::boolean,${fields.comment},${JSON.stringify(contacts)}::jsonb) AS result`;
  } catch (error) {
    const failure = error as { code?: string; detail?: string };
    if (failure.code === "P0001") contactError(failure.detail);
    throw error;
  }
  const result = rows[0]?.result as { status: string; rsvp?: SavedRsvp; contactPreferences?: GuestContactPreferences } | undefined;
  if (result?.status === "full") throw new RsvpAdmissionError(RSVP_CAPACITY_MESSAGE);
  if (result?.status === "deadline") throw new RsvpAdmissionError(RSVP_DEADLINE_MESSAGE);
  if (result?.status === "closed") throw new RsvpAdmissionError(RSVP_CLOSED_MESSAGE);
  if (result?.status === "invalid") throw new RsvpAdmissionError("Please refresh the page and check your response before trying again.");
  if (!result || !["created", "updated", "duplicate", "missing"].includes(result.status)) throw new Error("RSVP could not be saved.");
  return result;
}

// Bearer-token authorization, scoped to one event/RSVP. Never called by the Hub.
export async function getGuestContactPreferences(hash: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<GuestContactPreferences | null> {
  const slug = eventScopeSlug(scope), sql = database();
  const rows = await sql`SELECT c.email,c.phone,coalesce(c.revision,0)::int AS revision,
    coalesce(s.collection_closed,false) AS "collectionClosed"
    FROM rsvps r LEFT JOIN rsvp_contact_preferences c ON c.rsvp_id=r.id
    LEFT JOIN event_contact_settings s ON s.event_slug=r.event_slug
    WHERE r.event_slug=${slug} AND r.edit_token_hash=${hash} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return { ...EMPTY_CONTACT_PREFERENCES, email: row.email as string | null, phone: row.phone as string | null,
    emailOptIn: row.email != null, textOptIn: row.phone != null, revision: Number(row.revision), collectionClosed: row.collectionClosed === true };
}
export async function saveGuestContactPreferences(hash: string, input: ContactPreferences, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<GuestContactPreferences | null> {
  const slug = eventScopeSlug(scope), value = checked(input), sql = database();
  const rows = await sql`SELECT shindig_save_rsvp_contacts(${slug},${hash},${JSON.stringify(value)}::jsonb) AS result`;
  const result = rows[0]?.result;
  if (result?.status === "missing") return null;
  if (result?.status !== "saved") contactError(result?.status);
  return { ...value, revision: result.revision, collectionClosed: result.collectionClosed };
}

export type HostContact = {
  guestName: string; attending: boolean; email: string | null; phone: string | null;
  emailConsentedAt: string | null; textConsentedAt: string | null;
};
export type HostContacts = { contacts: HostContact[]; collectionClosed: boolean };
export async function listHostContacts(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<HostContacts> {
  await requireHostEventScope(scope);
  const slug = eventScopeSlug(scope), sql = database();
  const rows = await sql`SELECT r.guest_name AS "guestName",r.attending,c.email,c.phone,
    c.email_consented_at AS "emailConsentedAt",c.text_consented_at AS "textConsentedAt"
    FROM rsvp_contact_preferences c JOIN rsvps r ON r.id=c.rsvp_id
    WHERE r.event_slug=${slug} AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
    ORDER BY lower(r.guest_name),r.created_at`;
  const settings = await sql`SELECT collection_closed AS "collectionClosed" FROM event_contact_settings WHERE event_slug=${slug}`;
  const collectionClosed = settings[0]?.collectionClosed === true;
  // If cleanup committed between the two queries, don't return the earlier contacts.
  return { collectionClosed, contacts: collectionClosed ? [] : rows.map((r) => ({ guestName: String(r.guestName), attending: r.attending === true,
    email: r.email as string | null, phone: r.phone as string | null,
    emailConsentedAt: r.emailConsentedAt ? new Date(r.emailConsentedAt as string).toISOString() : null,
    textConsentedAt: r.textConsentedAt ? new Date(r.textConsentedAt as string).toISOString() : null })) };
}
export async function clearEventContacts(scope: EventScope = OYSTER_ROAST_SCOPE) {
  await requireHostEventScope(scope);
  const slug = eventScopeSlug(scope), sql = database();
  await sql`SELECT shindig_clear_event_contacts(${slug})`;
}
