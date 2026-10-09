// All writes use a disposable in-memory PostgreSQL database, never Neon.
import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.authenticated }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord, getEventDraft } from "../lib/server/event-drafts";
import { getDraftArtwork, saveDraftArtworkRecord } from "../lib/server/event-draft-artwork";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getPublishedEvent, publishEventRecord } from "../lib/server/event-publications";
import { confirmDraftLocation, findDraftAddress } from "../lib/server/event-location";
import { resolvePublicEventScope, resolveHostEventScope } from "../lib/server/event-scope";
import { saveRsvp, getRsvpForGuest, updateRsvpForGuest, getRsvpSummary, listRsvps, getPublicGuestList } from "../lib/server/rsvps";
import { validateRsvpSubmission, validateRsvpUpdate } from "../lib/server/rsvp-validation";
import { draft, snapshot } from "./fixtures/publication";
const modulePath = process.env.SHINDIG_TEST_PGLITE;
type Db = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> };
let db: Db, migration: string;
const backfillId = randomUUID();
const coordinates = { latitude: 38.846, longitude: -76.927 };
const manual = { ...coordinates, source: "manual" };
const weather = { ...snapshot.settings, features: { ...snapshot.settings.features, weather: true } };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  return (await db.query(parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), ""), values)).rows;
}
async function fixture() {
  const id = randomUUID();
  await saveEventDraftRecord(id, 0, draft);
  await saveDraftSettingsRecord(id, 0, weather);
  return { id, slug: `event-${id}`, versions: { details: 1, artwork: 0, settings: 1, publication: 0 } };
}
describe.skipIf(!modulePath)("saved location and complete event journey in PostgreSQL", () => {
  beforeAll(async () => {
    if (!modulePath || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(modulePath)) throw Error("Use disposable local PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ modulePath); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql") && !name.startsWith("021_")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/location_test");
    await saveEventDraftRecord(backfillId, 0, draft);
    await db.query("INSERT INTO event_draft_settings(event_id,max_party_size,allow_comments,guest_list_default_visible,features) VALUES ($1,4,false,false,$2::jsonb)", [backfillId, JSON.stringify(weather.features)]);
    await db.query("INSERT INTO event_publications(event_id,slug,snapshot,source_revisions) VALUES ($1,$2,$3::jsonb,$4::jsonb)", [backfillId, `event-${backfillId}`, JSON.stringify({ ...snapshot, settings: weather, coordinates }), JSON.stringify({ details: 1, artwork: 0, settings: 1, publication: 0 })]);
    migration = await readFile("db/migrations/021_confirmed_event_location.sql", "utf8");
    await db.exec(migration); await db.exec(migration);
  }, 30000);
  afterAll(async () => { if (db) await db.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  beforeEach(() => { state.authenticated = true; vi.stubGlobal("fetch", vi.fn()); });
  it("preserves already-reviewed locations exactly once, without changing live content or revisions", async () => {
    const saved = await getEventDraft(backfillId);
    expect(saved?.location).toMatchObject({ ...coordinates, address: draft.address, source: "published" });
    expect(saved?.revision).toBe(1); expect((await getPublishedEvent(`event-${backfillId}`))?.coordinates).toEqual(coordinates);
    await saveEventDraftRecord(backfillId, 1, { ...draft, address: "New place" });
    await saveEventDraftRecord(backfillId, 2, draft); await db.exec(migration);
    expect((await getEventDraft(backfillId))?.location).toBeNull();
    expect((await getPublishedEvent(`event-${backfillId}`))?.coordinates).toEqual(coordinates);
  });
  it("creates → styles → confirms → publishes → RSVPs → updates → verifies the host dashboard", async () => {
    const f = await fixture();
    const art = (await getDraftArtwork(f.id))!;
    await saveDraftArtworkRecord(f.id, 0, { ...art.settings, design: { style: "coastal", invitationCrop: { x: 50, y: 50, zoom: 100 } } });
    expect(await getPublishedEvent(f.slug)).toBeNull(); expect(await resolvePublicEventScope(f.slug)).toBeNull();
    const saved = await confirmDraftLocation(f.id, 1, manual, true);
    expect(saved.revision).toBe(2);
    expect((await getEventDraft(f.id))?.location).toEqual(saved.location);
    expect(await getPublishedEvent(f.slug)).toBeNull();
    const versions = { ...f.versions, details: 2, artwork: 1 };
    expect(await publishEventRecord(f.id, versions, coordinates)).toBe(1);
    const event = (await getPublishedEvent(f.slug))!;
    expect(event.design?.style).toBe("coastal"); expect(event.coordinates).toEqual(coordinates); expect(event.features.weather).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(/matchedAddress|location_confirmation|sourceRevisions|manual/);
    const scope = (await resolvePublicEventScope(f.slug))!;
    const id = randomUUID(), hash = createHash("sha256").update(randomUUID()).digest("hex");
    const fields = { id, eventSlug: f.slug, guestName: "Synthetic hidden guest", attending: true, partySize: 3, displayOnGuestList: false, comment: null };
    const valid = validateRsvpSubmission({ ...fields, submissionId: id }, { slug: f.slug, rules: { maxPartySize: 4, allowComments: false, guestListEnabled: true } });
    expect(valid.success).toBe(true); if (!valid.success) throw Error("Invalid fixture");
    expect((await saveRsvp(valid.data, hash, scope)).status).toBe("created");
    expect((await saveRsvp(valid.data, hash, scope)).status).toBe("duplicate");
    expect(await getRsvpForGuest(hash, scope)).toMatchObject({ partySize: 3, attending: true });
    const guests = await getPublicGuestList(scope);
    expect(JSON.stringify(guests)).not.toContain("Synthetic hidden guest");
    const update = validateRsvpUpdate({ ...fields, attending: false }, { maxPartySize: 4, allowComments: false, guestListEnabled: true });
    expect(update.success).toBe(true); if (!update.success) throw Error("Invalid fixture");
    expect(await updateRsvpForGuest(hash, update.data, scope)).toMatchObject({ attending: false, partySize: null });
    const host = (await resolveHostEventScope(f.slug))!;
    expect(await getRsvpSummary(host)).toEqual({ totalAttending: 0, totalResponses: 1, declined: 1, totalPartySize: 0 });
    expect(await listRsvps("all", host)).toHaveLength(1);
  });
  it("rejects stale confirmations, unconfirmed saves, untrusted matches and publish-time coordinate substitutions", async () => {
    const f = await fixture();
    await expect(confirmDraftLocation(f.id, 1, manual, false)).rejects.toThrow("confirm");
    await expect(confirmDraftLocation(f.id, 1, { ...manual, latitude: 91 }, true)).rejects.toThrow("valid latitude");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: "MATCH", coordinates: { x: -76.927, y: 38.846 } }] } })));
    expect(await findDraftAddress(f.id, 1)).toEqual([{ ...coordinates, matchedAddress: "MATCH" }]);
    await expect(confirmDraftLocation(f.id, 1, { ...coordinates, latitude: 40, source: "census", matchedAddress: "MATCH" }, true)).rejects.toThrow("current address match");
    const saved = await confirmDraftLocation(f.id, 1, { ...coordinates, source: "census", matchedAddress: "MATCH" }, true);
    expect(saved.location.source).toBe("census");
    await expect(confirmDraftLocation(f.id, 1, manual, true)).rejects.toThrow("draft has changed");
    expect(await publishEventRecord(f.id, f.versions, coordinates)).toBeNull();
    expect(await publishEventRecord(f.id, { ...f.versions, details: 2 }, { latitude: 0, longitude: 0 })).toBeNull();
    expect(await publishEventRecord(f.id, { ...f.versions, details: 2 }, coordinates)).toBe(1);
  });
  it("requires saved coordinates even if the client supplies valid numbers", async () => {
    const f = await fixture();
    expect(await publishEventRecord(f.id, f.versions, coordinates)).toBeNull();
    await expect(publishEventRecord(f.id, f.versions, null)).rejects.toThrow("Incomplete publication");
    expect(await getPublishedEvent(f.slug)).toBeNull();
  });
  it("invalidates confirmation on address changes, not unrelated edits, and keeps live coordinates frozen", async () => {
    const f = await fixture();
    await confirmDraftLocation(f.id, 1, manual, true);
    await publishEventRecord(f.id, { ...f.versions, details: 2 }, coordinates);
    await saveEventDraftRecord(f.id, 2, { ...draft, title: "New title" });
    expect((await getEventDraft(f.id))?.location).not.toBeNull();
    await saveEventDraftRecord(f.id, 3, { ...draft, address: "Different saved address" });
    expect((await getEventDraft(f.id))?.location).toBeNull();
    expect((await getPublishedEvent(f.slug))?.coordinates).toEqual(coordinates);
    expect(await saveEventDraftRecord(f.id, 3, draft)).toBeNull();
  });
  it("guards location integrity in PostgreSQL and bumps revisions for direct SQL changes", async () => {
    const f = await fixture();
    for (const value of [{ address: draft.address, matchedAddress: "Bad", ...manual, latitude: 99 }, { address: "Different", matchedAddress: "Bad", ...manual }, { address: draft.address, matchedAddress: "Bad", ...manual, secret: "extra" }]) await expect(db.query("UPDATE events SET location_confirmation=$2::jsonb WHERE id=$1", [f.id, JSON.stringify(value)])).rejects.toThrow();
    await db.query("UPDATE events SET location_confirmation=$2::jsonb WHERE id=$1", [f.id, JSON.stringify({ address: draft.address, matchedAddress: draft.address, ...manual })]);
    expect((await getEventDraft(f.id))?.revision).toBe(2);
    await db.query("UPDATE events SET address='Changed by SQL' WHERE id=$1", [f.id]);
    expect((await getEventDraft(f.id))?.location).toBeNull(); expect((await getEventDraft(f.id))?.revision).toBe(3);
  });
  it("blocks unauthenticated address retrieval and saving before contacting a provider", async () => {
    const f = await fixture(); state.authenticated = false;
    await expect(findDraftAddress(f.id, 1)).rejects.toThrow("Host access");
    await expect(confirmDraftLocation(f.id, 1, manual, true)).rejects.toThrow("Host access");
    expect(fetch).not.toHaveBeenCalled();
  });
});
