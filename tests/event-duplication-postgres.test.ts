// Opt-in, fresh in-memory PostgreSQL. This cannot connect to Neon/production.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authenticated: true, loseResponse: false, copy: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.authenticated }));
vi.mock("../lib/server/duplicate-artwork", () => ({ copyEventArtwork: state.copy }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { duplicateEventRecord, getDuplicationSource } from "../lib/server/event-duplication";
import { getEventDraft, saveEventDraftRecord } from "../lib/server/event-drafts";
import { getDraftArtwork } from "../lib/server/event-draft-artwork";
import { getDraftSettings, saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getPublishedEvent, publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { saveInvitationSettings } from "../lib/server/invitation-settings";
import { saveEventHubHeaderSettings } from "../lib/server/event-hub-settings";
import { DEFAULT_INVITATION_SETTINGS } from "../lib/invitation-settings";
import { DEFAULT_EVENT_HUB_HEADER } from "../lib/event-hub-settings";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { draft, snapshot } from "./fixtures/publication";
import type { CopyArtworkSource } from "../lib/server/duplicate-artwork";

const embeddedModule = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> };
const queries: string[] = [];
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  const statement = parts.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ""), "");
  queries.push(statement);
  const result = await db.query(statement, values);
  if (state.loseResponse && statement.startsWith("WITH request AS")) { state.loseResponse = false; throw new Error("Network response lost after commit"); }
  return result.rows;
}
async function createSource(settings = true) {
  const id = randomUUID(); await saveEventDraftRecord(id, 0, draft);
  if (settings) await saveDraftSettingsRecord(id, 0, snapshot.settings);
  return id;
}
async function request(source: string) {
  return { source, requestId: randomUUID(), fingerprint: (await getDuplicationSource(source))!.fingerprint, title: "The next gathering", confirmed: true };
}
async function count(table: string, column: string, id: string) {
  // Identifiers below are hardcoded by tests, never user input.
  return Number((await db.query(`SELECT count(*) AS total FROM ${table} WHERE ${column} = $1`, [id])).rows[0].total);
}
async function hasNoDraft(id: string) {
  for (const [table, key] of [["events", "id"], ["event_draft_artwork", "event_id"], ["event_draft_settings", "event_id"], ["event_data_scopes", "event_id"], ["event_publications", "event_id"]]) expect(await count(table, key, id)).toBe(0);
}
describe.skipIf(!embeddedModule)("real PostgreSQL private event duplication", () => {
  beforeAll(async () => {
    if (!embeddedModule || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embeddedModule)) throw new Error("Use disposable local PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ embeddedModule);
    db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/duplication_test");
  }, 30000);
  afterAll(async () => { if (db) await db.close(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    state.authenticated = true; state.loseResponse = false; queries.length = 0; state.copy.mockReset();
    state.copy.mockImplementation(async (id: string, source: CopyArtworkSource) => {
      const result = structuredClone(EMPTY_DRAFT_ARTWORK); Object.assign(result.header, source.crop);
      for (const kind of ["invitation", "header"] as const) if (source.images[kind]) Object.assign(result[kind], { path: `event-drafts/${id}/${kind}/5199b7de-d731-4bb1-8e55-3380e2f0e365.png`, alt: source.images[kind]!.alt });
      return result;
    });
  });
  it("copies an archived event's latest saved setup, not its publication or guest activity", async () => {
    const sourceId = await createSource(), slug = `event-${sourceId}`;
    await publishEventRecord(sourceId, { details: 1, artwork: 0, settings: 1, publication: 0 }, null, "original-garden-event");
    await db.query("INSERT INTO rsvps (id,event_slug,guest_name,attending,party_size,comment,edit_token_hash,display_on_guest_list) VALUES ($1,$2,'Private guest',true,3,'Secret comment',$3,false)", [randomUUID(), slug, "a".repeat(64)]);
    await db.query("INSERT INTO playlist_suggestions (id,event_slug,song_title,artist,suggested_by) VALUES ($1,$2,'Old song','Artist','Private guest')", [randomUUID(), slug]);
    await db.query("INSERT INTO event_questions (id,event_slug,question,guest_name,submission_hash) VALUES ($1,$2,'Private question?','Private guest',$3)", [randomUUID(), slug, "b".repeat(64)]);
    await db.query("INSERT INTO event_updates (id,event_slug,message) VALUES ($1,$2,'Old host update')", [randomUUID(), slug]);
    await saveEventDraftRecord(sourceId, 1, { ...draft, title: "Unpublished source name", description: "Latest private description" });
    const sourceArt = { ...EMPTY_DRAFT_ARTWORK, invitation: { path: `event-drafts/${sourceId}/invitation/5199b7de-d731-4bb1-8e55-3380e2f0e365.png`, alt: "Saved artwork" }, header: { ...EMPTY_DRAFT_ARTWORK.header, focalX: 32 } };
    await db.query("INSERT INTO event_draft_artwork (event_id,settings) VALUES ($1,$2::jsonb)", [sourceId, JSON.stringify(sourceArt)]);
    await changeEventLifecycleRecord(sourceId, 1, "archive");
    const before = await getEventDraft(sourceId), input = await request(sourceId); queries.length = 0;
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
    expect(queries.join(" ")).not.toMatch(/\b(rsvps|playlist_suggestions|event_questions|event_updates|polls|event_publications)\b/);
    const copy = await getEventDraft(input.requestId);
    expect(copy).toMatchObject({ ...snapshot.details, id: input.requestId, revision: 1, title: input.title, description: "Latest private description", startsAtUtc: null, endsAtUtc: null, createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect((await getDraftSettings(input.requestId))!.settings).toEqual({ ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, deadlineAtUtc: null, capacity: null } });
    const art = (await getDraftArtwork(input.requestId))!.settings;
    expect(art.invitation.path).toContain(`event-drafts/${input.requestId}/`); expect(art.invitation.path).not.toBe(sourceArt.invitation.path); expect(art.header.focalX).toBe(32);
    expect(await count("event_data_scopes", "event_id", input.requestId)).toBe(1);
    expect(await count("event_publications", "event_id", input.requestId)).toBe(0);
    expect(await getPublishedEvent(`event-${input.requestId}`)).toBeNull();
    for (const table of ["rsvps", "playlist_suggestions", "event_questions", "event_updates", "polls"]) expect(await count(table, "event_slug", `event-${input.requestId}`)).toBe(0);
    for (const table of ["rsvps", "playlist_suggestions", "event_questions", "event_updates"]) expect(await count(table, "event_slug", slug)).toBe(1);
    expect(await getEventDraft(sourceId)).toEqual(before); expect((await getDraftArtwork(sourceId))!.settings).toEqual(sourceArt);
    expect((await db.query("SELECT visibility,public_alias FROM event_publications WHERE event_id=$1", [sourceId])).rows[0]).toEqual({ visibility: "archived", public_alias: "original-garden-event" });
  });
  it("serializes concurrent same-request submissions into one complete draft", async () => {
    const input = await request(await createSource());
    expect(await Promise.all([duplicateEventRecord(input), duplicateEventRecord(input), duplicateEventRecord(input)])).toEqual(Array(3).fill(input.requestId));
    for (const [table, key] of [["events", "id"], ["event_draft_artwork", "event_id"], ["event_draft_settings", "event_id"], ["event_duplication_requests", "id"]]) expect(await count(table, key, input.requestId)).toBe(1);
    expect((await db.query("SELECT completed_at FROM event_duplication_requests WHERE id=$1", [input.requestId])).rows[0].completed_at).toBeTruthy();
  });
  it("acknowledges a lost commit response without overwriting later edits or re-copying artwork", async () => {
    const input = await request(await createSource()); state.loseResponse = true;
    await expect(duplicateEventRecord(input)).rejects.toThrow("response lost");
    await saveEventDraftRecord(input.requestId, 1, { ...draft, title: "Edited after copying" });
    await saveEventDraftRecord(input.source, 1, { ...draft, title: "Source also changed" });
    state.copy.mockClear(); queries.length = 0;
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
    expect(state.copy).not.toHaveBeenCalled(); expect(queries).toHaveLength(1);
    expect((await getEventDraft(input.requestId))!.title).toBe("Edited after copying");
  });
  it("binds a request key to the exact source, version and name", async () => {
    const input = await request(await createSource()); await duplicateEventRecord(input);
    for (const changed of [{ title: "Different" }, { fingerprint: "f".repeat(64) }, { source: randomUUID() }]) await expect(duplicateEventRecord({ ...input, ...changed })).rejects.toThrow("different details");
    const another = { ...input, requestId: randomUUID() }; expect(await duplicateEventRecord(another)).toBe(another.requestId);
  });
  it("rejects stale source review before creating a reservation or copying files", async () => {
    const input = await request(await createSource());
    await saveDraftSettingsRecord(input.source, 1, { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, maxPartySize: 6 } });
    await expect(duplicateEventRecord(input)).rejects.toThrow("source setup changed");
    expect(await count("event_duplication_requests", "id", input.requestId)).toBe(0); expect(state.copy).not.toHaveBeenCalled(); await hasNoDraft(input.requestId);
  });
  it("leaves only a retryable reservation if artwork fails", async () => {
    const input = await request(await createSource()); state.copy.mockRejectedValueOnce(new Error("Storage down"));
    await expect(duplicateEventRecord(input)).rejects.toThrow("Storage down"); await hasNoDraft(input.requestId);
    expect(await count("event_duplication_requests", "id", input.requestId)).toBe(1);
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
  });
  it("rolls back event, scope, artwork and settings together on a database constraint failure", async () => {
    const input = await request(await createSource());
    state.copy.mockResolvedValueOnce({ ...EMPTY_DRAFT_ARTWORK, extra: "x".repeat(5000) });
    await expect(duplicateEventRecord(input)).rejects.toThrow(); await hasNoDraft(input.requestId);
    expect((await db.query("SELECT completed_event_id,completed_at FROM event_duplication_requests WHERE id=$1", [input.requestId])).rows[0]).toEqual({ completed_event_id: null, completed_at: null });
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
  });
  it("does not overwrite an existing event when a forged request ID collides", async () => {
    const destination = await createSource(), original = await getEventDraft(destination);
    const input = { ...await request(await createSource()), requestId: destination };
    await expect(duplicateEventRecord(input)).rejects.toThrow("already in use");
    expect(await getEventDraft(destination)).toEqual(original); expect(await count("event_draft_artwork", "event_id", destination)).toBe(0);
  });
  it("keeps unsaved RSVP defaults unsaved for explicit review", async () => {
    const input = await request(await createSource(false)); await duplicateEventRecord(input);
    expect(await getDraftSettings(input.requestId)).toEqual({ settings: DEFAULT_DRAFT_SETTINGS, revision: 0 });
  });
  it("keeps capacity but clears the deadline with the copied event dates", async () => {
    const source = await createSource();
    await saveDraftSettingsRecord(source, 1, { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, deadlineAtUtc: "2026-11-01T22:00:00.000Z", capacity: 32 } });
    const input = await request(source); await duplicateEventRecord(input);
    expect((await getDraftSettings(input.requestId))!.settings.rsvp).toMatchObject({ deadlineAtUtc: null, capacity: 32 });
    expect((await getDraftSettings(source))!.settings.rsvp.deadlineAtUtc).toBe("2026-11-01T22:00:00.000Z");
  });
  it("copies legacy setup without mutating it, and hashes edited invitation/header settings", async () => {
    const old = await getDuplicationSource("oyster-roast-2026");
    await saveInvitationSettings({ ...DEFAULT_INVITATION_SETTINGS, description: "New legacy description" }, 0);
    const edited = await getDuplicationSource("oyster-roast-2026"); expect(edited!.fingerprint).not.toBe(old!.fingerprint);
    await saveEventHubHeaderSettings({ ...DEFAULT_EVENT_HUB_HEADER, focalX: 41 });
    const source = (await getDuplicationSource("oyster-roast-2026"))!; expect(source.fingerprint).not.toBe(edited!.fingerprint);
    const input = await request(source.key); await duplicateEventRecord(input);
    expect((await getEventDraft(input.requestId))!.description).toBe("New legacy description");
    expect((await getDraftArtwork(input.requestId))!.settings.header.focalX).toBe(41);
    expect(await getDuplicationSource(source.key)).toEqual(source);
  });
  it("rejects absent/malformed sources and checks authentication before database access", async () => {
    expect(await getDuplicationSource(randomUUID())).toBeNull(); expect(await getDuplicationSource("nope")).toBeNull();
    state.authenticated = false; queries.length = 0;
    await expect(getDuplicationSource("oyster-roast-2026")).rejects.toThrow("Host access");
    await expect(duplicateEventRecord({})).rejects.toThrow("Host access"); expect(queries).toHaveLength(0);
  });
  it("can rerun migration 018 without disturbing completed receipts", async () => {
    const input = await request(await createSource()); await duplicateEventRecord(input);
    await db.exec(await readFile("db/migrations/018_event_duplication.sql", "utf8"));
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
    await expect(db.query("INSERT INTO event_duplication_requests (id,source_key,source_fingerprint,requested_title) VALUES ($1,'untrusted',$2,'Name')", [randomUUID(), "a".repeat(64)])).rejects.toThrow();
    await expect(db.query("UPDATE event_duplication_requests SET completed_at=NULL WHERE id=$1", [input.requestId])).rejects.toThrow();
  });
});
