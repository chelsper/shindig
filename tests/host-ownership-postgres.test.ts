// Real SQL and application DAL, using disposable in-memory PostgreSQL only.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ operator: false, host: "alice" as string | null, blob: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.operator }));
vi.mock("../lib/server/host-auth", () => ({ getHostAccountSession: async () => state.host ? { id: state.host, name: state.host, email: `${state.host}@example.test` } : null }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
vi.mock("@vercel/blob", () => ({ head: state.blob, get: state.blob, put: state.blob }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { saveEventDraftRecord, getEventDraft, listEventDrafts } from "../lib/server/event-drafts";
import { getDraftArtwork, saveDraftArtworkRecord } from "../lib/server/event-draft-artwork";
import { getDraftSettings, saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getEventPublication, getHostEventPublication, listHostPublications, publishEventRecord, changeEventLifecycleRecord, isEventAliasAvailable } from "../lib/server/event-publications";
import { getDuplicationSource, duplicateEventRecord } from "../lib/server/event-duplication";
import { getHostDraftScope, resolveHostEventScope, resolvePublicEventScope, OYSTER_ROAST_SCOPE } from "../lib/server/event-scope";
import { getPublicGuestList, saveRsvp, listRsvps, getRsvpSummary, updateRsvpForAdmin, createRsvpForAdmin } from "../lib/server/rsvps";
import { listQuestionsForAdmin, insertGuestQuestion, listPublicQuestions, saveQuestionAnswer } from "../lib/server/questions";
import { insertHostUpdate, listPublicHostUpdates } from "../lib/server/updates";
import { hostScopeArgs } from "../lib/server/host-event";
import { requireOwnedEvent, requireOwnedCopyReservation } from "../lib/server/host-access";
import { saveInvitationSettings } from "../lib/server/invitation-settings";
import { DEFAULT_INVITATION_SETTINGS } from "../lib/invitation-settings";
import { GET as exportGuests } from "../app/admin/events/[id]/guests/export/route";
import { GET as getPrivateImage, POST as uploadPrivateImage } from "../app/admin/events/[id]/artwork/image/route";
import { GET as qr } from "../app/admin/events/[id]/share/qr/route";
import { draft, snapshot } from "./fixtures/publication";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { listHostEventCards } from "../lib/server/event-dashboard";
import { getPotluckClaim, listHostPotluckItems, listPublicPotluckItems, releaseHostPotluckClaim, saveHostPotluckItem, writePotluckClaim } from "../lib/server/potluck";
import { createRsvpEditToken } from "../lib/rsvp-edit-token";

const embedded = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  const sql = parts.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ""), "");
  return (await db.query(sql, values)).rows;
}
const as = (owner: string | null) => { state.operator = owner === null; state.host = owner; };
async function make(owner: string | null, published = true) {
  as(owner);
  const id = randomUUID(), slug = `event-${id}`;
  await saveEventDraftRecord(id, 0, { ...draft, title: `${owner ?? "legacy"} private event` });
  await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, features: { ...snapshot.settings.features, guestList: true, questions: true, updates: true, weather: false } });
  if (published) expect(await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null)).toBe(1);
  return { id, slug };
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!embedded)("host ownership with real PostgreSQL", () => {
  beforeAll(async () => {
    if (!embedded || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embedded)) throw new Error("Disposable PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ embedded); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    await db.exec(`INSERT INTO host_users(id,name,email,"emailVerified") VALUES ('alice','Alice','alice@example.test',true),('bob','Bob','bob@example.test',true)`);
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/ownership_test");
    vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", "synthetic-private-store");
  }, 30000);
  beforeEach(() => { as("alice"); state.blob.mockReset(); });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

  it("binds creation to the authenticated identity and isolates lists, drafts and publications", async () => {
    const a = await make("alice"), b = await make("bob"), legacy = await make(null);
    as("alice");
    expect((await listEventDrafts()).every((row) => row.title.startsWith("alice"))).toBe(true);
    expect((await listHostPublications()).every((row) => row.title.startsWith("alice"))).toBe(true);
    const aliceCards = await listHostEventCards();
    expect(aliceCards.some(({ id }) => id === a.id)).toBe(true);
    expect(aliceCards.every(({ title }) => title.startsWith("alice"))).toBe(true);
    expect(aliceCards.some(({ id }) => id === b.id || id === legacy.id)).toBe(false);
    expect(await getEventDraft(a.id)).not.toBeNull();
    for (const other of [b, legacy]) {
      expect(await getEventDraft(other.id)).toBeNull();
      expect(await getHostEventPublication(other.slug)).toBeNull();
      expect(await getDraftSettings(other.id)).toBeNull();
      expect(await getDraftArtwork(other.id)).toBeNull();
      expect(await getHostDraftScope(other.id)).toBeNull();
      expect(await resolveHostEventScope(other.slug)).toBeNull();
      expect(await saveEventDraftRecord(other.id, 1, { ...draft, title: "Intrusion" })).toBeNull();
      expect(await saveEventDraftRecord(other.id, 0, draft)).toBeNull();
      expect(await saveDraftSettingsRecord(other.id, 1, snapshot.settings)).toBeNull();
      expect(await saveDraftArtworkRecord(other.id, 0, EMPTY_DRAFT_ARTWORK)).toBeNull();
      expect(await changeEventLifecycleRecord(other.id, 1, "archive")).toBeNull();
      expect(await publishEventRecord(other.id, { details: 1, artwork: 0, settings: 1, publication: 1 }, null)).toBeNull();
      await expect(isEventAliasAvailable(other.id, "stolen-name")).rejects.toThrow("unavailable");
    }
    as(null); expect(await getEventDraft(a.id)).toBeNull(); expect(await getEventDraft(legacy.id)).not.toBeNull();
    expect((await listHostEventCards()).every(({ title }) => title.startsWith("legacy"))).toBe(true);
    const created = randomUUID(); as("alice");
    await saveEventDraftRecord(created, 0, { ...draft, owner_host_id: "bob", ownerId: "bob" } as typeof draft);
    expect((await db.query("SELECT owner_host_id FROM events WHERE id=$1", [created])).rows[0].owner_host_id).toBe("alice");
  });

  it("never authorizes administrative access with a public scope or a previous host's scope", async () => {
    const a = await make("alice");
    const owner = (await resolveHostEventScope(a.slug))!, publicScope = (await resolvePublicEventScope(a.slug))!;
    await expect(listRsvps("all", publicScope)).rejects.toThrow();
    await expect(listQuestionsForAdmin(publicScope)).rejects.toThrow();
    as("bob"); await expect(listRsvps("all", owner)).rejects.toThrow();
    await expect(getRsvpSummary(owner)).rejects.toThrow();
    await expect(insertHostUpdate(randomUUID(), { heading: null, message: "Intrusion" }, owner)).rejects.toThrow();
    state.host = null; state.operator = false;
    await expect(listRsvps("all", owner)).rejects.toThrow("Host access");
    // Public, intentionally minimal guest data still works without any session.
    expect(await getPublicGuestList(publicScope)).toEqual({ totalGuestCount: 0, guests: [] });
  });

  it("preserves guest privacy and binds guest mutations, exports and moderation to their event", async () => {
    const a = await make("alice"), b = await make("bob");
    const bGuest = (await resolvePublicEventScope(b.slug))!, bHost = (await resolveHostEventScope(b.slug))!;
    const guestId = randomUUID();
    await saveRsvp({ id: guestId, eventSlug: b.slug, guestName: "Bob's hidden guest", attending: true, partySize: 2, comment: "Private comment", displayOnGuestList: false }, "c".repeat(64), bGuest);
    await insertGuestQuestion({ question: "Private question", guestName: "Private asker", requestToken: randomUUID() }, bGuest);
    const question = (await listQuestionsForAdmin(bHost))[0];
    as("alice"); const aHost = (await resolveHostEventScope(a.slug))!;
    expect(await updateRsvpForAdmin(guestId, { guestName: "Intrusion", attending: false, partySize: null, comment: null, displayOnGuestList: false }, aHost)).toBe(false);
    expect(await saveQuestionAnswer(question.id, { answer: "Intrusion", isPublished: true }, aHost)).toBe(false);
    expect(await listRsvps("all", aHost)).toEqual([]);
    const forbidden = await exportGuests(new Request("https://www.haveashindig.com/admin/export"), context(b.id));
    expect(forbidden.status).toBe(404); expect(await forbidden.text()).not.toMatch(/hidden|comment|asker/);
    expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
    expect(await getPublicGuestList(bGuest)).toEqual({ totalGuestCount: 2, guests: [] });
    expect(await listPublicQuestions(bGuest)).toEqual([]);
    as("bob");
    expect((await exportGuests(new Request("https://www.haveashindig.com/admin/export"), context(b.id))).status).toBe(200);
    expect((await listRsvps("all", bHost))[0].guestName).toBe("Bob's hidden guest");
    await insertHostUpdate(randomUUID(), { heading: null, message: "Welcome" }, bHost);
    expect((await listPublicHostUpdates(bGuest))[0].message).toBe("Welcome");
  });

  it("rejects another host's private image, upload and QR before returning or writing bytes", async () => {
    const b = await make("bob"); as("alice");
    const path = `event-drafts/${b.id}/invitation/${randomUUID()}.png`;
    const url = `https://www.haveashindig.com/admin/events/${b.id}/artwork/image?path=${encodeURIComponent(path)}`;
    expect((await getPrivateImage(new Request(url), context(b.id))).status).toBe(404);
    const upload = new Request(url, { method: "POST", headers: { origin: "https://www.haveashindig.com", "content-length": "1" }, body: "x" });
    expect((await uploadPrivateImage(upload, context(b.id))).status).toBe(404);
    expect((await qr(new Request(`https://www.haveashindig.com/admin/events/${b.id}/share/qr?target=hub`), context(b.id))).status).toBe(404);
    expect(state.blob).not.toHaveBeenCalled();
  });

  it("isolates Bring Something administration and private claim names between hosts", async () => {
    const b = await make("bob");
    await saveDraftSettingsRecord(b.id, 1, { ...snapshot.settings, features: { ...snapshot.settings.features, potluck: true, weather: false } });
    await publishEventRecord(b.id, { details: 1, artwork: 0, settings: 2, publication: 1 }, null);
    const scope = (await resolvePublicEventScope(b.slug))!;
    const item = { key: randomUUID(), title: "Bags of ice", note: "", needed: 3, archived: false, revision: 0 };
    expect(await saveHostPotluckItem(b.slug, item)).toBe("saved");
    const claim = { itemKey: item.key, editToken: createRsvpEditToken(), guestName: "Bob's private helper", quantity: 2, revision: 0 };
    expect((await writePotluckClaim("create", claim, "d".repeat(64), scope)).status).toBe("saved");
    const claimId = (await listHostPotluckItems(b.slug))[0].claims[0].id;
    as("alice");
    await expect(listHostPotluckItems(b.slug)).rejects.toThrow();
    await expect(saveHostPotluckItem(b.slug, { ...item, revision: 1, title: "Intrusion" })).rejects.toThrow();
    await expect(releaseHostPotluckClaim(b.slug, claimId)).rejects.toThrow();
    expect(JSON.stringify(await listPublicPotluckItems(scope))).not.toMatch(/private helper|guestName|editToken|claims/);
    as("bob");
    expect((await listHostPotluckItems(b.slug))[0]).toMatchObject({ title: item.title, claims: [{ guestName: claim.guestName, quantity: 2 }] });
    expect((await getPotluckClaim(claim.editToken, scope))?.quantity).toBe(2);
    expect(await releaseHostPotluckClaim(b.slug, claimId)).toBe(true);
  });

  it("keeps duplication sources, receipt retries and destination ownership isolated", async () => {
    const b = await make("bob", false), source = (await getDuplicationSource(b.id))!, requestId = randomUUID();
    const input = { source: b.id, requestId, title: "Bob copy", fingerprint: source.fingerprint, confirmed: true };
    const copy = await duplicateEventRecord(input);
    expect(await duplicateEventRecord(input)).toBe(copy);
    expect((await db.query("SELECT owner_host_id FROM events WHERE id=$1", [copy])).rows[0].owner_host_id).toBe("bob");
    as("alice");
    expect(await getDuplicationSource(b.id)).toBeNull();
    await expect(duplicateEventRecord(input)).rejects.toThrow();
    await expect(requireOwnedEvent(b.id)).rejects.toThrow();
    await expect(requireOwnedCopyReservation(requestId, b.id)).rejects.toThrow();
    const a = await make("alice", false), ownSource = (await getDuplicationSource(a.id))!;
    await expect(duplicateEventRecord({ ...input, source: a.id, fingerprint: ownSource.fingerprint })).rejects.toThrow();
    expect(state.blob).not.toHaveBeenCalled();
  });

  it("does not let a Google host claim or moderate Jasper, even with a valid legacy scope", async () => {
    as("alice");
    expect(await getDuplicationSource("oyster-roast-2026")).toBeNull();
    await expect(hostScopeArgs()).rejects.toThrow();
    await expect(hostScopeArgs("oyster-roast-2026")).rejects.toThrow();
    await expect(listRsvps()).rejects.toThrow();
    await expect(createRsvpForAdmin(randomUUID(), { guestName: "Intrusion", attending: false, partySize: null, comment: null, displayOnGuestList: false }, OYSTER_ROAST_SCOPE)).rejects.toThrow();
    await expect(saveInvitationSettings(DEFAULT_INVITATION_SETTINGS, 0)).rejects.toThrow();
    as(null); expect(await hostScopeArgs()).toEqual([]); expect(await listRsvps()).toEqual([]);
  });

  it("enforces immutable owners and referential integrity without transferring existing data", async () => {
    const a = await make("alice"), legacy = await make(null);
    await expect(db.query("UPDATE events SET owner_host_id='bob' WHERE id=$1", [a.id])).rejects.toThrow();
    await expect(db.query("UPDATE events SET owner_host_id='alice' WHERE id=$1", [legacy.id])).rejects.toThrow();
    await expect(db.query("DELETE FROM host_users WHERE id='alice'")).rejects.toThrow();
    await db.exec(await readFile("db/migrations/020_host_accounts_ownership.sql", "utf8"));
    expect((await db.query("SELECT owner_host_id FROM events WHERE id=$1", [a.id])).rows[0].owner_host_id).toBe("alice");
    expect((await db.query("SELECT owner_host_id FROM events WHERE id=$1", [legacy.id])).rows[0].owner_host_id).toBeNull();
    expect(await getEventPublication(a.slug)).not.toBeNull();
    expect(JSON.stringify(await getEventPublication(a.slug))).not.toMatch(/owner_host_id|host_users|alice@example/);
  });
});
