// Disposable embedded PostgreSQL only. Never connects to Neon or saved data.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ auth: true, fail: false }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.auth }));
vi.mock("../lib/server/host-auth", () => ({ getHostAccountSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { changeEventLifecycleRecord, publishEventRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope, resolveHostEventScope, OYSTER_ROAST_SCOPE, type EventScope } from "../lib/server/event-scope";
import { getRsvpForGuest, saveRsvp, updateRsvpForGuest, updateRsvpForAdmin, deleteRsvpForAdmin, getPublicGuestList, listRsvps, getRsvpSummary } from "../lib/server/rsvps";
import { clearEventContacts, listHostContacts, getGuestContactPreferences, saveGuestContactPreferences, contactCollectionClosed } from "../lib/server/rsvp-contacts";
import { EMPTY_CONTACT_PREFERENCES } from "../lib/rsvp-contacts";
import { hashRsvpEditToken } from "../lib/server/rsvp-edit-token";
import { submitRsvp } from "../app/actions";
import { submitEventRsvp } from "../app/e/actions";
import { updateContactPreferences } from "../app/rsvp/contact-actions";
import { cleanUpContacts, refreshContacts } from "../app/admin/contacts/actions";
import { rsvpsToCsv } from "../lib/server/rsvp-csv";
import { draft, snapshot } from "./fixtures/publication";

const modulePath = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (state.fail) throw new Error("Synthetic private database details");
  return (await db.query(parts.reduce((s, p, i) => s+p+(i<values.length ? `$${i+1}` : ""), ""), values)).rows;
}
const fields = { guestName: "Synthetic guest", attending: true, partySize: 2, displayOnGuestList: false, comment: "Private note" };
const preferences = { ...EMPTY_CONTACT_PREFERENCES, emailOptIn: true, email: "guest@example.com", textOptIn: true, phone: "+19045550123" };
function hash() { return randomUUID().replaceAll("-", "").repeat(2); }
async function event() {
  const id = randomUUID(), slug = `event-${id}`;
  await saveEventDraftRecord(id, 0, { ...draft, startsAtUtc: "2099-11-07T22:00:00.000Z", endsAtUtc: "2099-11-08T02:00:00.000Z" });
  await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, features: { ...snapshot.settings.features, guestList: true }, rsvp: { ...snapshot.settings.rsvp, allowComments: true, capacity: 4 } });
  await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null);
  return { id, slug, guest: (await resolvePublicEventScope(slug))!, host: (await resolveHostEventScope(slug))! };
}
const input = (scope: EventScope, changes = {}) => ({ ...fields, id: randomUUID(), eventSlug: scope.slug, contactPreferences: preferences, ...changes });
describe.skipIf(!modulePath)("private RSVP contact storage on PostgreSQL", () => {
  beforeAll(async () => {
    if (!modulePath || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(modulePath)) throw new Error("Disposable local PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ modulePath); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/disposable_contacts");
  }, 30000);
  beforeEach(() => { state.auth = true; state.fail = false; });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });
  it.each(["legacy", "published"])("saves opted-in contacts atomically for %s without expanding public/CSV data", async kind => {
    const a = kind === "legacy" ? { guest: OYSTER_ROAST_SCOPE, host: OYSTER_ROAST_SCOPE } : await event();
    const token = hash(), submission = input(a.guest);
    const result = await saveRsvp(submission, token, a.guest);
    expect(result.status).toBe("created"); expect(JSON.stringify(result)).not.toContain("example.com");
    expect(await getGuestContactPreferences(token, a.guest)).toMatchObject({ ...preferences, revision: 1 });
    const contacts = await listHostContacts(a.host);
    expect(contacts.contacts).toContainEqual(expect.objectContaining({ email: preferences.email, phone: preferences.phone, emailConsentedAt: expect.any(String), textConsentedAt: expect.any(String) }));
    expect(await getPublicGuestList(a.guest)).toEqual({ totalGuestCount: 2, guests: [] });
    const rows = await listRsvps("all", a.host);
    for (const output of [JSON.stringify(rows), rsvpsToCsv(rows), JSON.stringify(await getRsvpForGuest(token, a.guest))]) {
      expect(output).not.toContain(preferences.email); expect(output).not.toContain(preferences.phone);
    }
    const stored = (await db.query("SELECT consent_version FROM rsvp_contact_preferences WHERE rsvp_id=$1", [submission.id])).rows[0];
    expect(stored.consent_version).toBe("event-updates-v1");
  });
  it("works without opting in and with a declined RSVP", async () => {
    const a = await event(), token = hash();
    await saveRsvp(input(a.guest, { attending: false, contactPreferences: EMPTY_CONTACT_PREFERENCES }), token, a.guest);
    expect(await getRsvpForGuest(token, a.guest)).toMatchObject({ attending: false, partySize: null });
    expect(await listHostContacts(a.host)).toEqual({ contacts: [], collectionClosed: false });
    const p = (await getGuestContactPreferences(token, a.guest))!;
    await saveGuestContactPreferences(token, { ...preferences, revision: p.revision }, a.guest);
    expect((await listHostContacts(a.host)).contacts[0].attending).toBe(false);
  });
  it("preserves timestamps on identical retries and never reapplies withdrawn contacts on duplicate RSVP", async () => {
    const a = await event(), token = hash(), submission = input(a.guest);
    expect((await Promise.all([saveRsvp(submission, token, a.guest), saveRsvp(submission, token, a.guest)])).map(r => r.status).sort()).toEqual(["created", "duplicate"]);
    const before = await listHostContacts(a.host);
    await saveGuestContactPreferences(token, preferences, a.guest); // network retry expected revision 0
    expect(await listHostContacts(a.host)).toEqual(before);
    await saveGuestContactPreferences(token, { ...EMPTY_CONTACT_PREFERENCES, revision: 1 }, a.guest);
    expect((await saveRsvp(submission, token, a.guest)).status).toBe("duplicate");
    expect((await listHostContacts(a.host)).contacts).toHaveLength(0);
    await expect(saveGuestContactPreferences(token, { ...preferences, revision: 1 }, a.guest)).rejects.toThrow("changed in another session");
  });
  it("rolls back RSVP creation/update when contact revision fails", async () => {
    const a = await event(), token = hash();
    await expect(saveRsvp(input(a.guest, { contactPreferences: { ...preferences, revision: 3 } }), token, a.guest)).rejects.toThrow("changed in another session");
    expect(await getRsvpForGuest(token, a.guest)).toBeNull();
    await saveRsvp(input(a.guest), token, a.guest);
    await expect(updateRsvpForGuest(token, { ...fields, partySize: 4, contactPreferences: { ...preferences, email: "new@example.com", revision: 0 } }, a.guest)).rejects.toThrow("changed in another session");
    expect((await getRsvpForGuest(token, a.guest))!.partySize).toBe(2);
    expect((await getGuestContactPreferences(token, a.guest))!.email).toBe(preferences.email);
  });
  it("preserves admission capacity and refuses guest contact operations on other events/tokens", async () => {
    const a = await event(), b = await event(), token = hash();
    await saveRsvp(input(a.guest), token, a.guest);
    await expect(saveRsvp(input(a.guest, { partySize: 3 }), hash(), a.guest)).rejects.toThrow("enough room");
    expect(await getGuestContactPreferences(token, b.guest)).toBeNull();
    expect(await saveGuestContactPreferences(token, preferences, b.guest)).toBeNull();
    expect(await saveGuestContactPreferences(hash(), preferences, a.guest)).toBeNull();
    expect((await listHostContacts(b.host)).contacts).toHaveLength(0);
  });
  it("lets guests withdraw after RSVP closure without touching attendance", async () => {
    const a = await event(), token = "x".repeat(43), hashed = hashRsvpEditToken(token);
    await saveRsvp(input(a.guest), hashed, a.guest);
    const before = await getRsvpForGuest(hashed, a.guest);
    await changeEventLifecycleRecord(a.id, 1, "close-rsvps");
    state.auth = false;
    const result = await updateContactPreferences(a.slug, token, { ...EMPTY_CONTACT_PREFERENCES, revision: 1 });
    expect(result).toMatchObject({ ok: true, preferences: { email: null, phone: null, revision: 2 } });
    expect(await getRsvpForGuest(hashed, a.guest)).toEqual(before);
  });
  it("host editing does not grant or clear guest consent; deleting RSVP cascades", async () => {
    const a = await event(), token = hash(), submission = input(a.guest);
    await saveRsvp(submission, token, a.guest);
    await updateRsvpForAdmin(submission.id, { ...fields, attending: false, contactPreferences: EMPTY_CONTACT_PREFERENCES }, a.host);
    expect((await getGuestContactPreferences(token, a.guest))!.email).toBe(preferences.email);
    expect((await listHostContacts(a.host)).contacts[0].attending).toBe(false);
    await deleteRsvpForAdmin(submission.id, a.host);
    expect((await listHostContacts(a.host)).contacts).toHaveLength(0);
    expect((await db.query("SELECT rsvp_id FROM rsvp_contact_preferences WHERE rsvp_id=$1", [submission.id])).rows).toHaveLength(0);
  });
  it("requires host scope/session for read, copy and cleanup, with confirmation", async () => {
    const a = await event();
    await expect(listHostContacts(a.guest)).rejects.toThrow();
    await expect(clearEventContacts({ ...a.host })).rejects.toThrow();
    expect((await cleanUpContacts(false, a.slug)).ok).toBe(false);
    state.auth = false;
    await expect(listHostContacts(a.host)).rejects.toThrow();
    await expect(clearEventContacts(a.host)).rejects.toThrow();
    expect((await refreshContacts(a.slug)).ok).toBe(false);
    expect((await cleanUpContacts(true, a.slug)).ok).toBe(false);
  });
  it("cleanup removes only this event's contacts, keeps RSVPs, and blocks stale/new collection", async () => {
    const a = await event(), b = await event(), token = hash();
    await saveRsvp(input(a.guest), token, a.guest); await saveRsvp(input(b.guest), hash(), b.guest);
    const before = await getRsvpSummary(a.host);
    expect(await cleanUpContacts(true, a.slug)).toEqual({ ok: true });
    expect(await listHostContacts(a.host)).toEqual({ contacts: [], collectionClosed: true });
    expect(await contactCollectionClosed(a.slug)).toBe(true);
    expect((await listHostContacts(b.host)).contacts).toHaveLength(1);
    expect(await getRsvpSummary(a.host)).toEqual(before);
    await expect(saveGuestContactPreferences(token, { ...preferences, revision: 1 }, a.guest)).rejects.toThrow("finished collecting");
    await expect(saveRsvp(input(a.guest), hash(), a.guest)).rejects.toThrow("finished collecting");
    expect((await saveRsvp(input(a.guest, { contactPreferences: EMPTY_CONTACT_PREFERENCES }), hash(), a.guest)).status).toBe("created");
    expect((await getGuestContactPreferences(token, a.guest))!.collectionClosed).toBe(true);
  });
  it("does not expose SQL/contact details or report success on failure", async () => {
    const a = await event(); state.fail = true;
    const payload = { ...fields, submissionId: randomUUID(), eventSlug: a.slug, editToken: "a".repeat(43), contactPreferences: preferences };
    for (const result of [await submitEventRsvp(a.slug, payload), await updateContactPreferences(a.slug, payload.editToken, preferences), await refreshContacts(a.slug)]) {
      expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("Synthetic private"); expect(JSON.stringify(result)).not.toContain(preferences.email);
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await submitRsvp({ ...payload, eventSlug: OYSTER_ROAST_SCOPE.slug })).ok).toBe(false); log.mockRestore();
  });
  it("reapplies migration without changing saved opt-ins, timestamps or RSVP counts", async () => {
    const a = await event(), token = hash(); await saveRsvp(input(a.guest), token, a.guest);
    const before = await listHostContacts(a.host), summary = await getRsvpSummary(a.host);
    await db.exec(await readFile("db/migrations/025_rsvp_contact_preferences.sql", "utf8"));
    expect(await listHostContacts(a.host)).toEqual(before); expect(await getRsvpSummary(a.host)).toEqual(summary);
  });
});
