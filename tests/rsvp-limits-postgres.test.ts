// Optional real PostgreSQL, isolated from Neon. Native mode also verifies row
// lock interleavings on independent connections; PGlite covers the same DAL.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ auth: true, failure: false }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { getDraftSettings, saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getPublishedEvent, getHostEventPublication, publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope, resolveHostEventScope, type EventScope } from "../lib/server/event-scope";
import { saveRsvp, updateRsvpForGuest, createRsvpForAdmin, updateRsvpForAdmin, deleteRsvpForAdmin, getPublicGuestList, getRsvpSummary, getRsvpForGuest } from "../lib/server/rsvps";
import { submitEventRsvp, updateEventRsvp } from "../app/e/actions";
import { RsvpAdmissionError, type RsvpLimits } from "../lib/rsvp-policy";
import { draft, snapshot } from "./fixtures/publication";

const embeddedModule = process.env.SHINDIG_TEST_PGLITE;
const socket = process.env.SHINDIG_TEST_LIMITS_PG_SOCKET;
const run = promisify(execFile);
let db: { query: (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> } | undefined;
const queries: string[] = [];
const fields = { guestName: "Synthetic guest", attending: true, partySize: 2, displayOnGuestList: true, comment: "Private note" };
function literal(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error("Unsupported test parameter");
}
async function native(sql: string) {
  if (!socket || !/^\/private\/tmp\/shindig-limits-pg\.[A-Za-z0-9]+$/.test(socket)) throw new Error("Disposable local limits socket required.");
  try {
    const { stdout } = await run(process.env.SHINDIG_TEST_PSQL || "psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-h", socket, "-p", "55449", "-d", "shindig_limits_test", "-c", sql]);
    return stdout.trim();
  } catch (error) {
    const failure = error as Error & { stderr?: string; code?: string; constraint?: string };
    // Preserve structured Postgres failures that the HTTP driver normally supplies.
    failure.code = /ERROR:\s+([0-9A-Z]{5}):/.exec(failure.stderr ?? "")?.[1];
    failure.constraint = /CONSTRAINT NAME:\s+(\S+)/.exec(failure.stderr ?? "")?.[1];
    throw failure;
  }
}
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (state.failure) throw new Error("Synthetic database unavailable: private details must stay private");
  const statement = parts.reduce((text, part, i) => text + part + (i < values.length ? db ? `$${i + 1}` : literal(values[i]) : ""), "");
  queries.push(statement);
  return db ? (await db.query(statement, values)).rows : JSON.parse(await native(`WITH result AS (${statement}) SELECT coalesce(json_agg(result),'[]') FROM result`));
}
async function event(limits: RsvpLimits = {}) {
  const id = randomUUID(), slug = `event-${id}`;
  await saveEventDraftRecord(id, 0, { ...draft, startsAtUtc: "2099-11-07T22:00:00.000Z", endsAtUtc: "2099-11-08T02:00:00.000Z" });
  await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, allowComments: true, ...limits } });
  expect(await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null)).toBe(1);
  return { id, slug, guest: (await resolvePublicEventScope(slug))!, host: (await resolveHostEventScope(slug))! };
}
function input(scope: EventScope, changes = {}) { return { ...fields, id: randomUUID(), eventSlug: scope.slug, ...changes }; }
function hash() { return randomUUID().replaceAll("-", "").repeat(2); }
async function republish(id: string, limits: RsvpLimits) {
  const settings = (await getDraftSettings(id))!, published = (await getHostEventPublication(`event-${id}`))!;
  const revision = await saveDraftSettingsRecord(id, settings.revision, { ...settings.settings, rsvp: { ...settings.settings.rsvp, ...limits } });
  return publishEventRecord(id, { details: 1, artwork: 0, settings: revision!, publication: published.revision }, null);
}

describe.skipIf(!embeddedModule && !socket)("real PostgreSQL RSVP deadlines and capacity", () => {
  beforeAll(async () => {
    if (socket) {
      expect(await native("SELECT current_database()")).toBe("shindig_limits_test");
      expect(await native("SHOW standard_conforming_strings")).toBe("on");
    } else {
      if (!embeddedModule || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embeddedModule)) throw new Error("Disposable local PGlite only.");
      const { PGlite } = await import(/* @vite-ignore */ embeddedModule); db = new PGlite();
    }
    for (const file of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = await readFile(`db/migrations/${file}`, "utf8"); if (db) await db.exec(sql); else await native(sql);
    }
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/shindig_limits_test");
  }, 30000);
  beforeEach(() => { state.auth = true; state.failure = false; queries.length = 0; });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

  it("counts hidden guests, not declines, and returns only public availability", async () => {
    const a = await event({ capacity: 3 }), b = await event({ capacity: 1 });
    await saveRsvp(input(a.guest, { guestName: "Hidden household", partySize: 3, displayOnGuestList: false }), hash(), a.guest);
    await saveRsvp(input(a.guest, { attending: false, partySize: 20 }), hash(), a.guest);
    expect(await getPublicGuestList(a.guest)).toEqual({ totalGuestCount: 3, guests: [] });
    const publicEvent = await getPublishedEvent(a.slug);
    expect(publicEvent?.rsvpAvailability).toBe("full");
    expect(JSON.stringify(publicEvent)).not.toMatch(/Hidden household|Private note|totalGuestCount|totalResponses|editTokenHash/);
    expect((await getPublishedEvent(b.slug))?.rsvpAvailability).toBe("open");
    await expect(saveRsvp(input(a.guest, { partySize: 1 }), hash(), a.guest)).rejects.toThrow(RsvpAdmissionError);
    expect((await getRsvpSummary(a.guest)).totalResponses).toBe(2);
  });
  it("accepts one of simultaneous parties competing for the last places", async () => {
    const a = await event({ capacity: 3 });
    await saveRsvp(input(a.guest, { partySize: 1 }), hash(), a.guest);
    const outcomes = await Promise.allSettled([saveRsvp(input(a.guest), hash(), a.guest), saveRsvp(input(a.guest), hash(), a.guest)]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getRsvpSummary(a.guest)).totalPartySize).toBe(3);
  });
  it("deduplicates same-key retries at capacity and after the deadline without overwriting", async () => {
    const a = await event({ capacity: 2 }), key = hash(), rsvp = input(a.guest);
    const results = await Promise.all([saveRsvp(rsvp, key, a.guest), saveRsvp(rsvp, key, a.guest)]);
    expect(results.map((r) => r.status).sort()).toEqual(["created", "duplicate"]);
    await republish(a.id, { deadlineAtUtc: "2001-11-01T22:00:00.000Z" });
    expect((await saveRsvp({ ...rsvp, guestName: "Do not overwrite" }, key, a.guest)).status).toBe("duplicate");
    expect((await getRsvpForGuest(key, a.guest))?.guestName).toBe(fields.guestName);
    await expect(saveRsvp(rsvp, hash(), a.guest)).rejects.toThrow();
    expect((await getRsvpSummary(a.guest)).totalResponses).toBe(1);
  });
  it("allows keeping/reducing a party or declining at capacity and releases seats", async () => {
    const a = await event({ capacity: 3 }), key = hash();
    await saveRsvp(input(a.guest, { partySize: 3 }), key, a.guest);
    expect(await updateRsvpForGuest(key, { ...fields, partySize: 3, comment: "Updated" }, a.guest)).toMatchObject({ partySize: 3, comment: "Updated" });
    await expect(updateRsvpForGuest(key, { ...fields, partySize: 4 }, a.guest)).rejects.toThrow("enough room");
    await updateRsvpForGuest(key, { ...fields, partySize: 1 }, a.guest);
    const other = hash(); await saveRsvp(input(a.guest), other, a.guest);
    expect(await updateRsvpForGuest(key, { ...fields, attending: false, partySize: 20 }, a.guest)).toMatchObject({ attending: false, partySize: null, displayOnGuestList: false });
    await expect(updateRsvpForGuest(key, fields, a.guest)).rejects.toThrow("enough room");
    expect(await updateRsvpForGuest(key, { ...fields, partySize: 1 }, a.guest)).toMatchObject({ attending: true, partySize: 1 });
  });
  it("checks the latest published deadline, never a stale captured scope or private draft", async () => {
    const a = await event(), key = hash();
    await saveRsvp(input(a.guest), key, a.guest);
    const settings = (await getDraftSettings(a.id))!;
    await saveDraftSettingsRecord(a.id, settings.revision, { ...settings.settings, rsvp: { ...settings.settings.rsvp, deadlineAtUtc: "2001-11-01T22:00:00.000Z" } });
    expect((await getPublishedEvent(a.slug))?.rsvpAvailability).toBe("open");
    await publishEventRecord(a.id, { details: 1, artwork: 0, settings: 2, publication: 1 }, null);
    expect((await getPublishedEvent(a.slug))?.rsvpAvailability).toBe("deadline");
    await expect(saveRsvp(input(a.guest, { attending: false }), hash(), a.guest)).rejects.toThrow("deadline");
    await expect(updateRsvpForGuest(key, { ...fields, attending: false }, a.guest)).rejects.toThrow("deadline");
    await republish(a.id, { deadlineAtUtc: null });
    expect((await saveRsvp(input(a.guest), hash(), a.guest)).status).toBe("created");
  });
  it("lets hosts correct closed/private events but never exceed capacity", async () => {
    const a = await event({ capacity: 3, deadlineAtUtc: "2001-11-01T22:00:00.000Z" });
    const rsvp = input(a.host); await createRsvpForAdmin(rsvp.id, rsvp, a.host);
    await expect(createRsvpForAdmin(randomUUID(), fields, a.host)).rejects.toThrow("published event capacity");
    expect(await updateRsvpForAdmin(rsvp.id, { ...fields, partySize: 3 }, a.host)).toBe(true);
    await changeEventLifecycleRecord(a.id, 1, "archive");
    expect(await updateRsvpForAdmin(rsvp.id, { ...fields, partySize: 1 }, a.host)).toBe(true);
    await expect(createRsvpForAdmin(randomUUID(), { ...fields, partySize: 3 }, a.host)).rejects.toThrow("capacity");
    expect(await deleteRsvpForAdmin(rsvp.id, a.host)).toBe(true);
    await createRsvpForAdmin(randomUUID(), { ...fields, partySize: 3 }, a.host);
    expect((await getRsvpSummary(a.host)).totalPartySize).toBe(3);
    expect(await getPublishedEvent(a.slug)).toBeNull();
  });
  it("requires real host authorization for host capacity writes", async () => {
    const a = await event();
    await expect(createRsvpForAdmin(randomUUID(), fields, a.guest)).rejects.toThrow("Host access");
    state.auth = false; queries.length = 0;
    await expect(createRsvpForAdmin(randomUUID(), fields, a.host)).rejects.toThrow("Host access");
    expect(queries).toHaveLength(0);
  });
  it("rejects publishing below saved attendance atomically and disabling capacity releases the limit", async () => {
    const a = await event({ capacity: 3 }); await saveRsvp(input(a.guest, { partySize: 3 }), hash(), a.guest);
    await expect(republish(a.id, { capacity: 2 })).rejects.toThrow("lower than the guests already attending");
    expect((await getHostEventPublication(a.slug))!.revision).toBe(1);
    expect((await getPublishedEvent(a.slug))!.rsvp?.capacity).toBe(3);
    await republish(a.id, { capacity: null });
    expect((await saveRsvp(input(a.guest), hash(), a.guest)).status).toBe("created");
    expect((await getRsvpSummary(a.guest)).totalPartySize).toBe(5);
  });
  it("does not let manual reopen bypass a deadline, or deadline removal bypass manual close", async () => {
    const a = await event({ deadlineAtUtc: "2001-11-01T22:00:00.000Z" });
    await changeEventLifecycleRecord(a.id, 1, "close-rsvps");
    await republish(a.id, { deadlineAtUtc: null });
    await expect(saveRsvp(input(a.guest), hash(), a.guest)).rejects.toThrow("closed RSVPs");
    await republish(a.id, { deadlineAtUtc: "2001-11-01T22:00:00.000Z" });
    await changeEventLifecycleRecord(a.id, 4, "reopen-rsvps");
    await expect(saveRsvp(input(a.guest), hash(), a.guest)).rejects.toThrow("deadline");
  });
  it("preserves server validation, friendly action failures and safe database errors", async () => {
    const a = await event({ capacity: 1 }), submit = { ...fields, submissionId: randomUUID(), eventSlug: a.slug, editToken: "b".repeat(43) };
    expect(await submitEventRsvp(a.slug, submit)).toMatchObject({ ok: false, message: expect.stringContaining("enough room") });
    for (const invalid of [{ guestName: " " }, { partySize: 0 }, { partySize: 21 }, { attending: "true" }]) expect((await submitEventRsvp(a.slug, { ...submit, ...invalid })).ok).toBe(false);
    expect((await submitEventRsvp(a.slug, { ...submit, partySize: 1 })).ok).toBe(true);
    await republish(a.id, { deadlineAtUtc: "2001-11-01T22:00:00.000Z" });
    expect(await updateEventRsvp(a.slug, { ...fields, partySize: 1, editToken: submit.editToken })).toMatchObject({ ok: false, message: expect.stringContaining("deadline") });
    state.failure = true;
    const failure = await submitEventRsvp(a.slug, submit);
    expect(failure.ok).toBe(false); expect(JSON.stringify(failure)).not.toContain("private details");
  });
  it("reapplies migration without changing existing replies or controls", async () => {
    const a = await event({ capacity: 4, deadlineAtUtc: "2099-11-01T22:00:00.000Z" });
    await saveRsvp(input(a.guest), hash(), a.guest);
    const before = await getRsvpSummary(a.guest), settings = await getDraftSettings(a.id), published = await getPublishedEvent(a.slug);
    const migration = await readFile("db/migrations/019_rsvp_deadline_capacity.sql", "utf8");
    if (db) await db.exec(migration); else await native(migration);
    expect(await getRsvpSummary(a.guest)).toEqual(before); expect(await getDraftSettings(a.id)).toEqual(settings); expect(await getPublishedEvent(a.slug)).toEqual(published);
  });
  it.skipIf(!socket)("refreshes the count after a native concurrent lock wait, including publication checks", async () => {
    const a = await event({ capacity: 4 });
    const marker = `limits_${randomUUID()}`;
    const hold = native(`/*${marker}*/ BEGIN; SELECT slug FROM event_publications WHERE slug=${literal(a.slug)} FOR UPDATE; SELECT pg_sleep(0.4); SELECT shindig_write_event_rsvp(${literal(a.slug)},'guest-create',${literal(randomUUID())}::uuid,${literal(hash())},'Held party',true,3,false,NULL); COMMIT;`);
    const until = Date.now() + 5000;
    while (await native(`SELECT count(*) FROM pg_stat_activity WHERE query LIKE ${literal(`/*${marker}*/%`)} AND wait_event='PgSleep'`) !== "1") {
      if (Date.now() > until) throw new Error("Holder did not enter the synchronized test window");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // Both start before the held insert commits. Neither may count its old
    // statement snapshot after waiting for the publication row lock.
    const write = saveRsvp(input(a.guest), hash(), a.guest);
    const lower = republish(a.id, { capacity: 2 });
    const outcomes = await Promise.allSettled([write, lower]); await hold;
    expect(outcomes.every((r) => r.status === "rejected")).toBe(true);
    expect((await getRsvpSummary(a.guest)).totalPartySize).toBe(3);
    expect((await getPublishedEvent(a.slug))!.rsvp?.capacity).toBe(4);
  });
});
