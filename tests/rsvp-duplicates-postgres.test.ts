// Synthetic fixtures only, in disposable PostgreSQL. Never Neon/production.
import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ auth: true, owner: "", fail: false }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.auth }));
vi.mock("../lib/server/host-access", () => ({ requireHostPrincipal: async () => { if (!state.auth) throw new Error("Host access required"); return { ownerId: state.owner || null }; }, isHostAuthenticated: async () => state.auth }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { listPossibleDuplicateRsvps, decideRsvpDuplicate } from "../lib/server/rsvp-duplicates";
import { getPublicGuestList, getRsvpSummary, getRsvpForGuest, saveRsvp, updateRsvpForGuest } from "../lib/server/rsvps";
import { getGuestContactPreferences, saveGuestContactPreferences } from "../lib/server/rsvp-contacts";
import { resolveHostEventScope, resolvePublicEventScope, type EventScope } from "../lib/server/event-scope";
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { publishEventRecord } from "../lib/server/event-publications";
import { draft, snapshot } from "./fixtures/publication";
import type { DuplicatePair } from "../lib/rsvp-duplicates";
const embedded = process.env.SHINDIG_TEST_PGLITE, socket = process.env.SHINDIG_TEST_DUPLICATES_PG_SOCKET;
let pool: Pool | undefined;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (state.fail) throw new Error("Synthetic database failure");
  return (await db.query(parts.reduce((s, p, i) => s + p + (i < values.length ? `$${i+1}` : ""), ""), values)).rows;
}
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
const contacts = { emailOptIn: true, textOptIn: false, email: "synthetic@example.test", phone: null, revision: 0 };
let oldId: string, latestId: string, oldHash: string, newHash: string;
const slug = "oyster-roast-2026";
async function insert(event = slug, name = "Synthetic Berg", attending = true) {
  const id = randomUUID(), token = hash();
  await db.query("INSERT INTO rsvps(id,event_slug,guest_name,attending,party_size,display_on_guest_list,edit_token_hash,created_at,updated_at,comment) VALUES($1,$2,$3,$4,$5,$4,$6,'2026-10-01','2026-10-01','Synthetic note')", [id, event, name, attending, attending ? 3 : null, token]);
  return { id, token };
}
async function pair() {
  return (await listPossibleDuplicateRsvps()).pairs.find(p => [p.older.id,p.latest.id].includes(oldId) && [p.older.id,p.latest.id].includes(latestId))!;
}
function decision(p: DuplicatePair, action = "merge") { return { action, olderId: p.older.id, latestId: p.latest.id, olderVersion: p.older.version, latestVersion: p.latest.version, confirmed: true }; }
async function versions() { return decision(await pair()); }
describe.skipIf(!embedded && !socket)("duplicate review with real PostgreSQL", () => {
  beforeAll(async () => {
    if (socket) {
      if (!/^\/private\/tmp\/shindig-duplicates-pg\.[a-zA-Z0-9]+$/.test(socket)) throw new Error("Disposable socket only.");
      pool = new Pool({ host: socket, port: 55450, database: "shindig_duplicates_test", max: 8, statement_timeout: 10000 });
      const check = (await pool.query("SELECT current_database() AS name,inet_server_addr() AS address,to_regclass('public.rsvps') AS existing")).rows[0];
      if (check.name !== "shindig_duplicates_test" || check.address !== null || check.existing !== null) throw new Error("Use a fresh isolated database.");
      db = { query: (s,v) => pool!.query(s,v), exec: s => pool!.query(s), close: () => pool!.end() };
    } else {
      if (!embedded || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embedded)) throw new Error("Disposable PGlite only.");
      const { PGlite } = await import(/* @vite-ignore */ embedded); db = new PGlite();
    }
    for (const file of (await readdir("db/migrations")).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/duplicates_test");
  }, 30000);
  beforeEach(async () => {
    state.auth = true; state.owner = ""; state.fail = false;
    await db.query("DELETE FROM event_invitees WHERE event_slug=$1", [slug]);
    await db.query("DELETE FROM rsvps WHERE event_slug=$1", [slug]);
    await db.query("UPDATE event_contact_settings SET collection_closed=false WHERE event_slug=$1", [slug]);
    const old = await insert(), latest = await insert(slug, "synthetic berg", false);
    oldId = old.id; latestId = latest.id; oldHash = old.token; newHash = latest.token;
    await db.query("UPDATE rsvps SET updated_at='2026-10-02' WHERE id=$1", [latestId]);
  });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });
  it("merges an older attending response into the latest decline and corrects totals/public names", async () => {
    const v = await versions();
    expect((await getPublicGuestList()).totalGuestCount).toBe(3);
    expect(await decideRsvpDuplicate(v)).toBe("merged");
    expect(await getPublicGuestList()).toEqual({ totalGuestCount: 0, guests: [] });
    expect(await getRsvpSummary()).toEqual({ totalAttending: 0, totalResponses: 1, declined: 1, totalPartySize: 0 });
    expect(await getRsvpForGuest(newHash)).toMatchObject({ attending: false, partySize: null, comment: "Synthetic note" });
    expect(await getRsvpForGuest(oldHash)).toBeNull();
    expect(new Date((await db.query("SELECT updated_at FROM rsvps WHERE id=$1", [latestId])).rows[0].updated_at as string).getTime()).toBeGreaterThan(Date.parse("2026-10-02"));
    expect(await decideRsvpDuplicate(v)).toBe("merged");
    expect((await getRsvpSummary()).totalResponses).toBe(1);
  });
  it("keeps latest attending party size and privacy; never sums both parties", async () => {
    await db.query("UPDATE rsvps SET attending=true,party_size=2,display_on_guest_list=false WHERE id=$1", [latestId]);
    await decideRsvpDuplicate(await versions());
    expect(await getPublicGuestList()).toEqual({ totalGuestCount: 2, guests: [] });
    expect((await getRsvpSummary()).totalResponses).toBe(1);
  });
  it("persists keep-separate without changing RSVP data, resurfaces after an edit", async () => {
    const p = await pair(), before = await getRsvpSummary();
    await decideRsvpDuplicate(decision(p, "separate"));
    expect((await listPossibleDuplicateRsvps()).total).toBe(0); expect(await getRsvpSummary()).toEqual(before);
    await db.query("UPDATE rsvps SET comment='Changed note',updated_at=clock_timestamp() WHERE id=$1", [oldId]);
    expect((await listPossibleDuplicateRsvps()).total).toBe(1);
  });
  it.each(["rsvp", "contacts", "tracker"])("rejects a stale %s review without partial changes", async kind => {
    const v = await versions();
    if (kind === "rsvp") await db.query("UPDATE rsvps SET comment='Changed' WHERE id=$1", [oldId]);
    if (kind === "contacts") await saveGuestContactPreferences(oldHash, contacts);
    if (kind === "tracker") await db.query("INSERT INTO event_invitees(id,event_slug,guest_name,rsvp_id) VALUES($1,$2,'Planner',$3)", [randomUUID(),slug,oldId]);
    await expect(decideRsvpDuplicate(v)).rejects.toThrow("changed");
    expect((await getRsvpSummary()).totalResponses).toBe(2);
  });
  it("moves one tracker link but refuses to silently combine two planner entries", async () => {
    const invite = randomUUID();
    await db.query("INSERT INTO event_invitees(id,event_slug,guest_name,rsvp_id) VALUES($1,$2,'Planner',$3)", [invite,slug,oldId]);
    await db.query("INSERT INTO event_invitees(id,event_slug,guest_name,rsvp_id) VALUES($1,$2,'Other Planner',$3)", [randomUUID(),slug,latestId]);
    await expect(decideRsvpDuplicate(await versions())).rejects.toThrow("separate invitation");
    await db.query("UPDATE event_invitees SET rsvp_id=NULL WHERE rsvp_id=$1", [latestId]);
    await decideRsvpDuplicate(await versions());
    expect((await db.query("SELECT rsvp_id,revision FROM event_invitees WHERE id=$1", [invite])).rows[0]).toMatchObject({ rsvp_id: latestId, revision: 2 });
    expect((await db.query("SELECT id FROM event_invitees WHERE event_slug=$1", [slug])).rows).toHaveLength(2);
  });
  it("never revives withdrawn consent or accepts a pre-merge preference revision", async () => {
    await saveGuestContactPreferences(newHash, contacts);
    await saveGuestContactPreferences(oldHash, { ...contacts, emailOptIn: false, email: null });
    await db.query("UPDATE rsvp_contact_preferences SET updated_at='2090-01-01' WHERE rsvp_id=$1", [oldId]);
    await decideRsvpDuplicate(await versions());
    expect(await getGuestContactPreferences(newHash)).toMatchObject({ emailOptIn: false, email: null, revision: 2 });
    await expect(saveGuestContactPreferences(newHash, { ...contacts, revision: 1 })).rejects.toThrow("changed");
  });
  it("keeps newer consent on the retained response without copying older details", async () => {
    await saveGuestContactPreferences(oldHash, { ...contacts, email: "older@example.test" });
    await saveGuestContactPreferences(newHash, contacts);
    await db.query("UPDATE rsvp_contact_preferences SET updated_at='2000-01-01' WHERE rsvp_id=$1", [oldId]);
    await decideRsvpDuplicate(await versions());
    expect(await getGuestContactPreferences(newHash)).toMatchObject({ email: contacts.email, revision: 2 });
  });
  it("blocks retired submission IDs and hashes; latest token still edits normally", async () => {
    await decideRsvpDuplicate(await versions());
    const fields = { guestName: "Synthetic", attending: true, partySize: 2, displayOnGuestList: false, comment: null };
    await expect(saveRsvp({ ...fields, id: oldId, eventSlug: slug }, oldHash)).rejects.toThrow("merged");
    await expect(saveRsvp({ ...fields, id: randomUUID(), eventSlug: slug }, oldHash)).rejects.toThrow("merged");
    expect(await updateRsvpForGuest(newHash, fields)).toMatchObject({ attending: true, partySize: 2 });
    expect(await updateRsvpForGuest(oldHash, fields)).toBeNull();
  });
  it("enforces host auth, explicit confirmation, event ownership and cross-event isolation", async () => {
    const v = await versions(); state.auth = false;
    await expect(listPossibleDuplicateRsvps()).rejects.toThrow(); await expect(decideRsvpDuplicate(v)).rejects.toThrow();
    state.auth = true; await expect(decideRsvpDuplicate({ ...v, confirmed: false })).rejects.toThrow("confirm");
    await expect(decideRsvpDuplicate(v, {} as EventScope)).rejects.toThrow();
    state.owner = randomUUID();
    await db.query('INSERT INTO host_users(id,name,email,"emailVerified") VALUES($1,\'Synthetic host\',$2,true)', [state.owner, `${state.owner}@example.test`]);
    const id = randomUUID(); await saveEventDraftRecord(id, 0, draft); await saveDraftSettingsRecord(id, 0, snapshot.settings);
    await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null);
    const scope = (await resolveHostEventScope(`event-${id}`))!;
    await expect(decideRsvpDuplicate(v, scope)).rejects.toThrow("no longer available");
    await expect(listPossibleDuplicateRsvps((await resolvePublicEventScope(`event-${id}`))!)).rejects.toThrow();
    state.owner = ""; await expect(listPossibleDuplicateRsvps(scope)).rejects.toThrow();
    expect((await getRsvpSummary()).totalResponses).toBe(2);
  });
  it("fails closed on provider failure and installs idempotently without touching guests", async () => {
    const v = await versions(); state.fail = true; await expect(decideRsvpDuplicate(v)).rejects.toThrow(); state.fail = false;
    await db.exec(await readFile("db/migrations/029_rsvp_duplicate_review.sql", "utf8"));
    expect(await versions()).toEqual(v); expect((await getRsvpSummary()).totalResponses).toBe(2);
  });
  it("handles a published owned event after closing RSVPs, without touching the legacy event", async () => {
    const id = randomUUID(), event = `event-${id}`;
    await saveEventDraftRecord(id, 0, draft); await saveDraftSettingsRecord(id, 0, snapshot.settings);
    await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null);
    const host = (await resolveHostEventScope(event))!, guest = (await resolvePublicEventScope(event))!;
    const a = await insert(event), b = await insert(event, "synthetic berg", false);
    await db.query("UPDATE rsvps SET updated_at='2026-10-02' WHERE id=$1", [b.id]);
    await db.query("UPDATE event_publications SET rsvps_open=false WHERE slug=$1", [event]);
    const review = (await listPossibleDuplicateRsvps(host)).pairs[0];
    expect(review.older.id).toBe(a.id); expect(review.latest.id).toBe(b.id);
    await decideRsvpDuplicate(decision(review), host);
    expect(await getPublicGuestList(guest)).toEqual({ totalGuestCount: 0, guests: [] });
    expect((await getRsvpSummary(host)).totalResponses).toBe(1);
    expect((await getRsvpSummary()).totalResponses).toBe(2);
  });
  it("supports successive merges without losing retirement protection", async () => {
    await decideRsvpDuplicate(await versions());
    const third = await insert(slug, "Synthetic Berg", true);
    await db.query("UPDATE rsvps SET updated_at='2090-01-01' WHERE id=$1", [third.id]);
    await decideRsvpDuplicate(decision((await listPossibleDuplicateRsvps()).pairs[0]));
    expect((await db.query("SELECT retained_id FROM rsvp_merge_retirements WHERE retired_id=$1", [oldId])).rows[0].retained_id).toBe(third.id);
    expect((await getRsvpSummary()).totalResponses).toBe(1);
  });
  it("preserves closed collection without restoring any contact data", async () => {
    await saveGuestContactPreferences(newHash, contacts);
    await db.query("SELECT shindig_clear_event_contacts($1)", [slug]);
    await decideRsvpDuplicate(await versions());
    expect(await getGuestContactPreferences(newHash)).toMatchObject({ emailOptIn: false, email: null, collectionClosed: true });
  });
  it("deleting the retained RSVP also cleans up retirement and dismissal metadata", async () => {
    await decideRsvpDuplicate(await versions());
    await db.query("DELETE FROM rsvps WHERE id=$1", [latestId]);
    expect((await db.query("SELECT * FROM rsvp_merge_retirements WHERE event_slug=$1", [slug])).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM rsvp_duplicate_dismissals WHERE event_slug=$1", [slug])).rows).toHaveLength(0);
  });
  it.skipIf(!socket)("serializes repeated merge clicks across independent connections", async () => {
    const v = await versions(), blocker = await pool!.connect();
    await blocker.query("BEGIN"); await blocker.query("SELECT * FROM event_contact_settings WHERE event_slug=$1 FOR UPDATE", [slug]);
    let results;
    try {
      const pending = Promise.all([decideRsvpDuplicate(v), decideRsvpDuplicate(v)]);
      await delay(100); await blocker.query("COMMIT"); results = await pending;
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect(results).toEqual(["merged","merged"]); expect((await getRsvpSummary()).totalResponses).toBe(1);
  });
  it.skipIf(!socket)("rechecks the reviewed row after a concurrent edit commits", async () => {
    const v = await versions(), blocker = await pool!.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("UPDATE rsvps SET comment='Concurrent edit' WHERE id=$1", [latestId]);
      const pending = decideRsvpDuplicate(v).then(value => value, error => error);
      await delay(100); await blocker.query("COMMIT"); expect(await pending).toMatchObject({ message: expect.stringContaining("changed") });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect((await getRsvpSummary()).totalResponses).toBe(2);
  });
  it.skipIf(!socket)("blocks an old submission retry waiting for an uncommitted merge", async () => {
    const v = await versions(), blocker = await pool!.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT shindig_review_rsvp_duplicate($1,$2,$3,$4,$5,'merge')", [slug,v.olderId,v.latestId,v.olderVersion,v.latestVersion]);
      const pending = saveRsvp({ id: oldId, eventSlug: slug, guestName: "Synthetic Berg", attending: true, partySize: 3, displayOnGuestList: true, comment: null }, oldHash).then(value => value, error => error);
      await delay(100); await blocker.query("COMMIT"); expect(await pending).toMatchObject({ constraint: "rsvp_retired" });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect((await getRsvpSummary()).totalResponses).toBe(1);
  });
});
