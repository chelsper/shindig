// All data is synthetic. Native mode uses a fresh Unix-socket-only database;
// PGlite covers SQL semantics, but cannot prove independent lock-wait behavior.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ owner: "", auth: true, copy: vi.fn(), failCreation: false }));
vi.mock("../lib/server/host-access", () => ({
  requireHostPrincipal: async () => { if (!state.auth) throw new Error("Host access required"); return { ownerId: state.owner || null }; },
  isHostAuthenticated: async () => state.auth,
}));
vi.mock("../lib/server/duplicate-artwork", () => ({ copyEventArtwork: state.copy }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord, getEventDraft } from "../lib/server/event-drafts";
import { getHostEventUsage } from "../lib/server/host-event-limits";
import { getDuplicationSource, duplicateEventRecord } from "../lib/server/event-duplication";
import { HostEventLimitError } from "../lib/host-event-limits";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { draft, snapshot } from "./fixtures/publication";

const embedded = process.env.SHINDIG_TEST_PGLITE, socket = process.env.SHINDIG_TEST_HOST_LIMITS_PG_SOCKET;
let pool: Pool | undefined;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
const statements: string[] = [];
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  const sql = parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), "");
  statements.push(sql);
  if (state.failCreation && sql.includes("shindig_check_event_capacity")) throw new Error("Database unavailable");
  return (await db.query(sql, values)).rows;
}
const create = (id: string = randomUUID()) => saveEventDraftRecord(id, 0, draft);
async function copyInput(source: string) {
  return { source, requestId: randomUUID(), fingerprint: (await getDuplicationSource(source))!.fingerprint, title: "Another gathering", confirmed: true };
}

describe.skipIf(!embedded && !socket)("per-host capacity with real PostgreSQL", () => {
  beforeAll(async () => {
    if (socket) {
      if (!/^\/private\/tmp\/shindig-host-limits-pg\.[a-zA-Z0-9]+$/.test(socket)) throw new Error("Disposable host-limits socket only.");
      pool = new Pool({ host: socket, port: 55449, database: "shindig_host_limits_test", max: 8 });
      const check = await pool.query("SELECT current_database() AS name, inet_server_addr() AS address, to_regclass('public.events') AS existing");
      if (check.rows[0].name !== "shindig_host_limits_test" || check.rows[0].address !== null || check.rows[0].existing !== null) throw new Error("Use a fresh disposable host-limits test database.");
      db = { query: (sql, values) => pool!.query(sql, values), exec: sql => pool!.query(sql), close: () => pool!.end() };
    } else {
      if (!embedded || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embedded)) throw new Error("Disposable PGlite only.");
      const { PGlite } = await import(/* @vite-ignore */ embedded); db = new PGlite();
    }
    for (const file of (await readdir("db/migrations")).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/host_limits_test");
  }, 30000);
  beforeEach(async () => {
    state.owner = randomUUID(); state.auth = true; state.failCreation = false; statements.length = 0;
    vi.stubEnv("HOST_EVENT_LIMIT", "2"); state.copy.mockReset(); state.copy.mockResolvedValue(EMPTY_DRAFT_ARTWORK);
    await db.query('INSERT INTO host_users(id,name,email,"emailVerified") VALUES ($1,\'Synthetic host\',$2,true)', [state.owner, `${state.owner}@example.test`]);
  });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

  it("counts drafts and copies together, denies new creation at the limit, preserves edits and retries", async () => {
    const first = (await create())!.id, input = await copyInput(first);
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
    expect(await getHostEventUsage()).toEqual({ used: 2, limit: 2 });
    await expect(create()).rejects.toBeInstanceOf(HostEventLimitError);
    expect(await create(first)).toEqual({ id: first, revision: 1 });
    expect(await saveEventDraftRecord(first, 1, { ...draft, title: "Edited at capacity" })).toEqual({ id: first, revision: 2 });
    expect(await create(first)).toBeNull();
    state.copy.mockClear(); expect(await duplicateEventRecord(input)).toBe(input.requestId); expect(state.copy).not.toHaveBeenCalled();
  });
  it("rejects a new copy before reservation or Blob writes when already full", async () => {
    const source = (await create())!.id; await create(); const input = await copyInput(source);
    await expect(duplicateEventRecord(input)).rejects.toBeInstanceOf(HostEventLimitError);
    expect(state.copy).not.toHaveBeenCalled();
    expect((await db.query("SELECT id FROM event_duplication_requests WHERE id=$1", [input.requestId])).rows).toHaveLength(0);
  });
  it("rechecks after artwork copying so an intervening creation cannot exceed the limit", async () => {
    const source = (await create())!.id, input = await copyInput(source);
    state.copy.mockImplementationOnce(async () => { await create(); return EMPTY_DRAFT_ARTWORK; });
    await expect(duplicateEventRecord(input)).rejects.toBeInstanceOf(HostEventLimitError);
    expect(await getHostEventUsage()).toEqual({ used: 2, limit: 2 });
    expect(await getEventDraft(input.requestId)).toBeNull();
    expect((await db.query("SELECT completed_event_id FROM event_duplication_requests WHERE id=$1", [input.requestId])).rows[0].completed_event_id).toBeNull();
  });
  it("isolates owners and legacy workspace; ignores forged client limit and ownership", async () => {
    vi.stubEnv("HOST_EVENT_LIMIT", "1");
    const id = randomUUID(); await saveEventDraftRecord(id, 0, { ...draft, ownerId: "someone-else", limit: 1000 } as typeof draft);
    await expect(create()).rejects.toBeInstanceOf(HostEventLimitError);
    const owner = state.owner; state.owner = "";
    expect(await getHostEventUsage()).toEqual({ used: 0, limit: 1 });
    const legacy = (await create())!.id; await expect(create()).rejects.toBeInstanceOf(HostEventLimitError);
    state.owner = owner; expect(await getEventDraft(legacy)).toBeNull();
    expect((await db.query("SELECT owner_host_id FROM events WHERE id=$1", [id])).rows[0].owner_host_id).toBe(owner);
  });
  it("keeps over-limit events intact after a reduction or invalid setting; only creation is paused", async () => {
    const first = (await create())!.id; await create();
    for (const limit of ["1", "invalid"]) {
      vi.stubEnv("HOST_EVENT_LIMIT", limit); await expect(create()).rejects.toThrow();
      const existing = (await getEventDraft(first))!;
      expect(await saveEventDraftRecord(first, existing.revision, { ...draft, title: `Edited with ${limit}` })).toBeTruthy();
    }
    expect((await db.query("SELECT id FROM events WHERE owner_host_id=$1", [state.owner])).rows).toHaveLength(2);
  });
  it("frees a space only after actual deletion, keeping deleted IDs reserved", async () => {
    const id = (await create())!.id; await create();
    expect((await db.query("SELECT shindig_delete_owned_event($1,$2,$3,1,0,0,0) AS result", [id, state.owner, draft.title])).rows[0].result).toEqual({ status: "deleted" });
    expect(await getHostEventUsage()).toEqual({ used: 1, limit: 2 });
    await expect(create(id)).rejects.toThrow(); expect(await create()).toBeTruthy();
  });
  it("counts published, unpublished and archived events once, and keeps lifecycle actions working at capacity", async () => {
    vi.stubEnv("HOST_EVENT_LIMIT", "1");
    const id = (await create())!.id;
    await saveDraftSettingsRecord(id, 0, snapshot.settings);
    expect(await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null)).toBe(1);
    expect(await getHostEventUsage()).toEqual({ used: 1, limit: 1 });
    await expect(create()).rejects.toBeInstanceOf(HostEventLimitError);
    await changeEventLifecycleRecord(id, 1, "archive");
    expect(await getHostEventUsage()).toEqual({ used: 1, limit: 1 });
    await expect(create()).rejects.toBeInstanceOf(HostEventLimitError);
    await changeEventLifecycleRecord(id, 2, "restore");
    expect(await getHostEventUsage()).toEqual({ used: 1, limit: 1 });
    expect((await db.query("SELECT visibility FROM event_publications WHERE event_id=$1", [id])).rows[0].visibility).toBe("unpublished");
  });
  it("rolls back failed copies without consuming capacity and allows the same request to retry", async () => {
    const source = (await create())!.id, input = await copyInput(source);
    state.copy.mockResolvedValueOnce({ ...EMPTY_DRAFT_ARTWORK, extra: "x".repeat(5000) });
    await expect(duplicateEventRecord(input)).rejects.toThrow();
    expect(await getHostEventUsage()).toEqual({ used: 1, limit: 2 });
    expect(await duplicateEventRecord(input)).toBe(input.requestId);
  });
  it("fails closed on database failure and anonymous calls without writing anything", async () => {
    state.failCreation = true; await expect(create()).rejects.toThrow("Database unavailable");
    expect(await getHostEventUsage()).toEqual({ used: 0, limit: 2 });
    state.auth = false; statements.length = 0;
    await expect(create()).rejects.toThrow("Host access"); await expect(getHostEventUsage()).rejects.toThrow("Host access");
    await expect(duplicateEventRecord({})).rejects.toThrow("Host access"); expect(statements).toHaveLength(0);
  });
  it("can reapply migration 028 without changing events or usage", async () => {
    const id = (await create())!.id, before = await getEventDraft(id);
    await db.exec(await readFile("db/migrations/028_host_event_limits.sql", "utf8"));
    expect(await getEventDraft(id)).toEqual(before); expect(await getHostEventUsage()).toEqual({ used: 1, limit: 2 });
  });
  it.skipIf(!socket)("serializes a draft and a copy waiting on the last space across independent connections", async () => {
    const source = (await create())!.id, input = await copyInput(source), blocker = await pool!.connect();
    const lockKey = `shindig-host-capacity:host:${state.owner}`;
    let attempts: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lockKey]);
      attempts = Promise.allSettled([create(), duplicateEventRecord(input)]);
      let waiting = 0;
      for (let attempt = 0; attempt < 100; attempt++) {
        waiting = Number((await pool!.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].count);
        if (waiting >= 2) break; await delay(20);
      }
      expect(waiting).toBe(2); // Both statements began before either committed.
      await blocker.query("COMMIT");
      const results = await attempts;
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(HostEventLimitError);
      expect(await getHostEventUsage()).toEqual({ used: 2, limit: 2 });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); if (attempts) await attempts; }
  }, 15000);
});
