// Real SQL/DAL against disposable PostgreSQL only. Never touches Neon.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ host: "alice" as string | null, operator: false, fail: false }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.operator }));
vi.mock("../lib/server/host-auth", () => ({ getHostAccountSession: async () => state.host ? { id: state.host, name: state.host, email: `${state.host}@example.test` } : null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { getHostDraftScope, resolvePublicEventScope, OYSTER_ROAST_SCOPE, type EventScope } from "../lib/server/event-scope";
import { listInvitationTracker, changeInvitationRecord } from "../lib/server/invitation-tracker";
import { changeInvitation, refreshInvitationTracker } from "../app/admin/invitations/actions";
import { saveRsvp, deleteRsvpForAdmin, updateRsvpForAdmin, listRsvps, getPublicGuestList, getRsvpSummary } from "../lib/server/rsvps";
import { listHostContacts } from "../lib/server/rsvp-contacts";
import { rsvpsToCsv } from "../lib/server/rsvp-csv";
import { draft, snapshot } from "./fixtures/publication";

const modulePath = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (state.fail) throw new Error("Synthetic private database error with credentials");
  return (await db.query(parts.reduce((s, p, i) => s+p+(i<values.length ? `$${i+1}` : ""), ""), values)).rows;
}
async function event(owner = "alice", publish = false) {
  state.host = owner; state.operator = false;
  const id = randomUUID(), slug = `event-${id}`;
  await saveEventDraftRecord(id, 0, { ...draft, startsAtUtc: "2099-11-07T22:00:00.000Z", endsAtUtc: "2099-11-08T02:00:00.000Z" });
  await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, features: { ...snapshot.settings.features, weather: false, guestList: true } });
  if (publish) await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null);
  return { id, slug, host: (await getHostDraftScope(id))!, guest: publish ? (await resolvePublicEventScope(slug))! : null };
}
const invite = (changes = {}) => ({ kind: "save", id: randomUUID(), revision: 0, guestName: "Private invitee", email: "invitee@example.test", phone: "+19045550123", invited: false, ...changes });
async function rsvp(scope: EventScope, attending = true) {
  const id = randomUUID();
  await saveRsvp({ id, eventSlug: scope.slug, guestName: "RSVP household", attending, partySize: attending ? 2 : null, comment: "Private RSVP comment", displayOnGuestList: false }, randomUUID().replaceAll("-", "").repeat(2), scope);
  return id;
}
describe.skipIf(!modulePath)("private invitation tracker PostgreSQL", () => {
  beforeAll(async () => {
    if (!modulePath || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(modulePath)) throw new Error("Disposable local PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ modulePath); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    await db.exec(`INSERT INTO host_users(id,name,email,"emailVerified") VALUES ('alice','Alice','alice@example.test',true),('bob','Bob','bob@example.test',true)`);
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/disposable_invitation_tracker");
    vi.stubEnv("HOST_EVENT_LIMIT", "1000"); // This suite retains many unrelated fixture events.
  }, 30000);
  beforeEach(() => { state.host = "alice"; state.operator = false; state.fail = false; });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });
  it("supports private draft planning without creating RSVP, consent, or public guest entries", async () => {
    const a = await event(), input = invite();
    expect(await changeInvitation(input, a.slug)).toMatchObject({ ok: true, data: { invitees: [{ guestName: input.guestName, invited: false, response: null, revision: 1 }] } });
    expect(await getRsvpSummary(a.host)).toMatchObject({ totalResponses: 0, totalPartySize: 0 });
    expect(await listHostContacts(a.host)).toEqual({ contacts: [], collectionClosed: false });
    expect(await resolvePublicEventScope(a.slug)).toBeNull();
    await publishEventRecord(a.id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null);
    expect(await getPublicGuestList((await resolvePublicEventScope(a.slug))!)).toEqual({ totalGuestCount: 0, guests: [] });
    expect(rsvpsToCsv(await listRsvps("all", a.host))).not.toContain(input.email);
  });
  it("deduplicates rapid identical creation retries and never replays an older edited entry", async () => {
    const a = await event(), input = invite();
    await Promise.all([changeInvitationRecord(input, a.host), changeInvitationRecord(input, a.host)]);
    expect((await listInvitationTracker(a.host)).invitees).toHaveLength(1);
    await changeInvitationRecord({ ...input, revision: 1, email: null, phone: null, guestName: "Updated" }, a.host);
    await expect(changeInvitationRecord(input, a.host)).rejects.toThrow("changed");
    expect((await listInvitationTracker(a.host)).invitees[0]).toMatchObject({ guestName: "Updated", email: null, phone: null, revision: 2 });
  });
  it("tracks sent status and rejects stale edits without guessing a match from a name", async () => {
    const a = await event("alice", true), input = invite({ guestName: "RSVP household" });
    await rsvp(a.guest!); await changeInvitationRecord(input, a.host);
    expect((await listInvitationTracker(a.host)).invitees[0].response).toBeNull();
    const sent = { kind: "sent", id: input.id, revision: 1, invited: true };
    await changeInvitationRecord(sent, a.host);
    await expect(changeInvitationRecord({ ...sent, invited: false }, a.host)).rejects.toThrow("changed");
    expect((await listInvitationTracker(a.host)).invitees[0]).toMatchObject({ invited: true, revision: 2, response: null });
  });
  it("bulk marks only confirmed selected entries, leaving RSVPs and consent untouched", async () => {
    const a = await event("alice", true), inputs = [invite(), invite(), invite()];
    for (const input of inputs) await changeInvitationRecord(input, a.host);
    const before = await listRsvps("all", a.host), contacts = await listHostContacts(a.host);
    const batch = { kind: "sent-many", entries: inputs.slice(0, 2).map(({ id }) => ({ id, revision: 1 })), confirmed: true };
    expect((await changeInvitation({ ...batch, confirmed: false }, a.slug)).ok).toBe(false);
    const result = await changeInvitation(batch, a.slug); expect(result.ok).toBe(true);
    const rows = (await listInvitationTracker(a.host)).invitees;
    expect(rows.filter(i => i.invited)).toHaveLength(2); expect(rows.find(i => i.id === inputs[2].id)).toMatchObject({ invited: false, revision: 1 });
    expect(await listRsvps("all", a.host)).toEqual(before); expect(await listHostContacts(a.host)).toEqual(contacts);
    // A repeated request must not mutate already-sent rows or claim a second save.
    expect((await changeInvitation(batch, a.slug)).ok).toBe(false);
    expect((await listInvitationTracker(a.host)).invitees).toEqual(rows);
  });
  it.each(["stale", "foreign", "sent", "linked", "missing"])("rejects the entire bulk operation when a selected entry is %s", async invalid => {
    const a = await event("alice", true), one = invite(), two = invite();
    await changeInvitationRecord(one, a.host);
    const b = invalid === "foreign" ? await event() : a;
    await changeInvitationRecord(two, b.host);
    if (invalid === "stale") await changeInvitationRecord({ ...two, revision: 1, guestName: "Edited" }, a.host);
    if (invalid === "sent") await changeInvitationRecord({ kind: "sent", id: two.id, revision: 1, invited: true }, a.host);
    if (invalid === "linked") await changeInvitationRecord({ kind: "link", id: two.id, revision: 1, rsvpId: await rsvp(a.guest!), confirmed: true }, a.host);
    const before = await listInvitationTracker(a.host);
    const batch = { kind: "sent-many", entries: [{ id: one.id, revision: 1 }, { id: invalid === "missing" ? randomUUID() : two.id, revision: invalid === "sent" || invalid === "linked" ? 2 : 1 }], confirmed: true };
    expect((await changeInvitation(batch, a.slug)).ok).toBe(false);
    expect(await listInvitationTracker(a.host)).toEqual(before);
    state.host = "bob"; expect((await changeInvitation(batch, a.slug)).ok).toBe(false);
  });
  it.each([true, false])("links attending=%s only after confirmation and keeps RSVP/consent untouched", async attending => {
    const a = await event("alice", true), input = invite({ invited: true }), rsvpId = await rsvp(a.guest!, attending);
    await changeInvitationRecord(input, a.host);
    const before = await listRsvps("all", a.host), contacts = await listHostContacts(a.host);
    const match = { kind: "link", id: input.id, revision: 1, rsvpId };
    expect((await changeInvitation({ ...match, confirmed: false }, a.slug)).ok).toBe(false);
    await changeInvitationRecord({ ...match, confirmed: true }, a.host);
    const tracker = await listInvitationTracker(a.host);
    expect(tracker.invitees[0].response).toEqual({ id: rsvpId, guestName: "RSVP household", attending, partySize: attending ? 2 : null });
    expect(JSON.stringify(tracker)).not.toContain("Private RSVP comment");
    expect(await listRsvps("all", a.host)).toEqual(before); expect(await listHostContacts(a.host)).toEqual(contacts);
    await changeInvitationRecord({ kind: "unlink", id: input.id, revision: 2 }, a.host);
    expect((await listInvitationTracker(a.host)).invitees[0]).toMatchObject({ response: null, invited: true });
  });
  it("enforces same-event and one-invitee-per-RSVP integrity, even with racing matches", async () => {
    const a = await event("alice", true), b = await event("alice", true), one = invite(), two = invite(), rsvpId = await rsvp(a.guest!), foreignId = await rsvp(b.guest!);
    await changeInvitationRecord(one, a.host); await changeInvitationRecord(two, a.host);
    await expect(changeInvitationRecord({ kind: "link", id: one.id, revision: 1, rsvpId: foreignId, confirmed: true }, a.host)).rejects.toThrow("isn’t available for this event");
    const attempts = await Promise.allSettled([one, two].map(input => changeInvitationRecord({ kind: "link", id: input.id, revision: 1, rsvpId, confirmed: true }, a.host)));
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await listInvitationTracker(a.host)).invitees.filter(i => i.response)).toHaveLength(1);
    expect((await listInvitationTracker(b.host)).invitees).toHaveLength(0);
  });
  it("reflects linked RSVP changes and returns to waiting when that RSVP is deleted", async () => {
    const a = await event("alice", true), input = invite({ invited: true }), rsvpId = await rsvp(a.guest!);
    await changeInvitationRecord(input, a.host);
    await changeInvitationRecord({ kind: "link", id: input.id, revision: 1, rsvpId, confirmed: true }, a.host);
    await updateRsvpForAdmin(rsvpId, { guestName: "Changed response", attending: false, partySize: null, comment: null, displayOnGuestList: false }, a.host);
    expect((await listInvitationTracker(a.host)).invitees[0].response).toMatchObject({ guestName: "Changed response", attending: false, partySize: null });
    await deleteRsvpForAdmin(rsvpId, a.host);
    expect((await listInvitationTracker(a.host)).invitees[0]).toMatchObject({ invited: true, response: null });
  });
  it("requires removal confirmation, deletes stored tracker contact details, and retains the RSVP", async () => {
    const a = await event("alice", true), input = invite(), rsvpId = await rsvp(a.guest!);
    await changeInvitationRecord(input, a.host);
    await changeInvitationRecord({ kind: "link", id: input.id, revision: 1, rsvpId, confirmed: true }, a.host);
    const remove = { kind: "remove", id: input.id, revision: 2 };
    expect((await changeInvitation(remove, a.slug)).ok).toBe(false);
    await changeInvitationRecord({ ...remove, confirmed: true }, a.host);
    expect((await listInvitationTracker(a.host)).invitees).toHaveLength(0);
    expect((await listRsvps("all", a.host))).toHaveLength(1);
    expect((await db.query("SELECT id FROM event_invitees WHERE id=$1", [input.id])).rows).toHaveLength(0);
  });
  it("protects readers and mutations from signed-out, forged, public and other-owner scopes", async () => {
    const a = await event("alice", true), input = invite(); await changeInvitationRecord(input, a.host);
    await expect(listInvitationTracker(a.guest!)).rejects.toThrow();
    await expect(changeInvitationRecord(invite(), { ...a.host })).rejects.toThrow();
    state.host = "bob";
    await expect(listInvitationTracker(a.host)).rejects.toThrow();
    expect((await refreshInvitationTracker(a.slug)).ok).toBe(false);
    expect((await changeInvitation({ kind: "remove", id: input.id, revision: 1, confirmed: true }, a.slug)).ok).toBe(false);
    const b = await event("bob");
    await expect(changeInvitationRecord({ ...input, revision: 1 }, b.host)).rejects.toThrow("changed");
    await expect(changeInvitationRecord(input, b.host)).rejects.toThrow("changed");
    state.host = null;
    expect((await changeInvitation(invite(), b.slug)).ok).toBe(false);
    expect((await refreshInvitationTracker()).ok).toBe(false);
    state.host = "alice"; expect((await listInvitationTracker(a.host)).invitees).toHaveLength(1);
  });
  it("supports legacy admin and inactive events without opening public access", async () => {
    const a = await event("alice", true);
    await changeEventLifecycleRecord(a.id, 1, "archive");
    expect((await changeInvitation(invite(), a.slug)).ok).toBe(true);
    expect(await resolvePublicEventScope(a.slug)).toBeNull();
    state.host = null; state.operator = true;
    expect((await changeInvitation(invite())).ok).toBe(true);
    expect((await listInvitationTracker(OYSTER_ROAST_SCOPE)).invitees).toHaveLength(1);
    state.operator = false; state.host = "alice";
    expect((await refreshInvitationTracker()).ok).toBe(false);
    expect((await refreshInvitationTracker("not-an-event")).ok).toBe(false);
  });
  it("shows friendly errors without false success or database/contact leakage", async () => {
    const a = await event(); state.fail = true;
    for (const result of [await changeInvitation(invite(), a.slug), await refreshInvitationTracker(a.slug)]) {
      expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toMatch(/credentials|invitee@example|SELECT|postgresql/);
    }
  });
  it("reapplies migration without rewriting invitees or existing RSVP data", async () => {
    const a = await event("alice", true); await rsvp(a.guest!); await changeInvitationRecord(invite(), a.host);
    const before = await listInvitationTracker(a.host), responses = await listRsvps("all", a.host);
    await db.exec(await readFile("db/migrations/026_private_invitation_tracker.sql", "utf8"));
    expect(await listInvitationTracker(a.host)).toEqual(before); expect(await listRsvps("all", a.host)).toEqual(responses);
  });
});
