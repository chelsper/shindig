// Disposable embedded PostgreSQL. Never connects to Neon or real guest data.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ auth: true, fail: false }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getPublishedEvent, publishEventRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope, type EventScope } from "../lib/server/event-scope";
import { getPotluckClaim, listHostPotluckItems, listPublicPotluckItems, potluckTokenHash, releaseHostPotluckClaim, saveHostPotluckItem, writePotluckClaim } from "../lib/server/potluck";
import { saveGuestPotluckClaim } from "../app/event/potluck-actions";
import { createRsvpEditToken } from "../lib/rsvp-edit-token";
import { draft, snapshot } from "./fixtures/publication";
const modulePath = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> };
const bucket = "a".repeat(64);
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (state.fail) throw new Error("postgresql://PRIVATE:password@PRIVATE_HOST/db");
  return (await db.query(parts.reduce((s, p, i) => s + p + (i < values.length ? `$${i + 1}` : ""), ""), values)).rows;
}
async function fixture(needed = 5, enabled = true) {
  const id = randomUUID(), slug = `event-${id}`, key = randomUUID();
  await saveEventDraftRecord(id, 0, draft);
  await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, features: { ...snapshot.settings.features, potluck: enabled } });
  await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null);
  const item = { key, title: "Bags of ice", note: "A 10 lb bag", needed, archived: false, revision: 0 };
  expect(await saveHostPotluckItem(slug, item)).toBe("saved");
  return { id, slug, key, item, scope: (await resolvePublicEventScope(slug))! };
}
const input = (itemKey: string, patch = {}) => ({ itemKey, editToken: createRsvpEditToken(), guestName: "Private Guest", quantity: 2, revision: 0, ...patch });
describe.skipIf(!modulePath)("Bring something PostgreSQL boundaries", () => {
  beforeAll(async () => {
    if (!modulePath || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(modulePath)) throw new Error("Disposable local PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ modulePath); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter(n => n.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/potluck_test");
  }, 30000);
  beforeEach(() => { state.auth = true; state.fail = false; });
  afterAll(async () => { if (db) await db.close(); vi.unstubAllEnvs(); });
  it("saves a canonical item and claim with only minimal public data", async () => {
    const f = await fixture(), data = input(f.key);
    const result = await writePotluckClaim("create", data, bucket, f.scope);
    expect(result).toMatchObject({ status: "saved", claim: { guestName: data.guestName, quantity: 2, revision: 1 } });
    expect(await listPublicPotluckItems(f.scope)).toEqual([{ key: f.key, title: f.item.title, note: f.item.note, needed: 5, claimed: 2 }]);
    const stored = (await db.query("SELECT * FROM potluck_claims WHERE event_slug=$1", [f.slug])).rows[0];
    expect(stored.edit_token_hash).toBe(potluckTokenHash(data.editToken)); expect(JSON.stringify(stored)).not.toContain(data.editToken);
    expect(JSON.stringify(await listPublicPotluckItems(f.scope))).not.toMatch(/Private Guest|guest_name|edit_token|requester|created_at|revision/);
    expect((await listHostPotluckItems(f.slug))[0].claims).toMatchObject([{ guestName: data.guestName, quantity: 2 }]);
  });
  it("deduplicates rapid and lost-response retries even when the last spots were taken", async () => {
    const f = await fixture(2), data = input(f.key);
    const results = await Promise.all([writePotluckClaim("create", data, bucket, f.scope), writePotluckClaim("create", data, bucket, f.scope)]);
    expect(results.every(r => r.status === "saved")).toBe(true);
    expect((await listHostPotluckItems(f.slug))[0].claims).toHaveLength(1);
    expect((await writePotluckClaim("create", { ...data, guestName: "Different" }, bucket, f.scope)).status).toBe("conflict");
    expect((await writePotluckClaim("create", input(f.key, { quantity: 1 }), bucket, f.scope)).status).toBe("full");
  });
  it("admits only one of two competing claims in the embedded database", async () => {
    const f = await fixture(3);
    const results = await Promise.all([writePotluckClaim("create", input(f.key), bucket, f.scope), writePotluckClaim("create", input(f.key), bucket, f.scope)]);
    expect(results.map(r => r.status).sort()).toEqual(["full", "saved"]);
    expect((await listPublicPotluckItems(f.scope))[0].claimed).toBe(2);
  });
  it("updates and cancels only the token holder's claim, checks capacity and stale revisions", async () => {
    const f = await fixture(3), data = input(f.key);
    await writePotluckClaim("create", data, bucket, f.scope);
    expect((await writePotluckClaim("update", { ...data, quantity: 4, revision: 1 }, bucket, f.scope)).status).toBe("full");
    expect((await writePotluckClaim("update", { ...data, quantity: 1, revision: 1 }, bucket, f.scope)).claim).toMatchObject({ quantity: 1, revision: 2 });
    expect((await writePotluckClaim("update", { ...data, quantity: 1, revision: 1 }, bucket, f.scope)).status).toBe("saved");
    expect((await writePotluckClaim("update", { ...data, revision: 1 }, bucket, f.scope)).status).toBe("conflict");
    expect((await writePotluckClaim("cancel", { ...data, revision: 2 }, bucket, f.scope)).claim).toMatchObject({ quantity: 0, revision: 3 });
    expect((await writePotluckClaim("cancel", { ...data, revision: 2 }, bucket, f.scope)).status).toBe("saved");
    expect((await listPublicPotluckItems(f.scope))[0].claimed).toBe(0);
    expect((await getPotluckClaim(data.editToken, f.scope))?.quantity).toBe(0);
    expect((await writePotluckClaim("update", { ...data, quantity: 3, revision: 3 }, bucket, f.scope)).claim?.quantity).toBe(3);
  });
  it("never authorizes with an item/claim ID, foreign-event token, or arbitrary scope", async () => {
    const a = await fixture(), b = await fixture(), data = input(a.key);
    await writePotluckClaim("create", data, bucket, a.scope);
    expect(await getPotluckClaim(a.key, a.scope)).toBeNull(); expect(await getPotluckClaim(createRsvpEditToken(), a.scope)).toBeNull();
    expect(await getPotluckClaim(data.editToken, b.scope)).toBeNull();
    expect((await writePotluckClaim("update", { ...data, itemKey: b.key, revision: 1 }, bucket, b.scope)).status).toBe("missing");
    expect((await writePotluckClaim("create", input(a.key), bucket, b.scope)).status).toBe("missing");
    await expect(listPublicPotluckItems({ ...a.scope } as EventScope)).rejects.toThrow("Event access");
  });
  it("keeps disabled modules absent and rechecks current publication after a stale scope was captured", async () => {
    const f = await fixture(), data = input(f.key);
    await writePotluckClaim("create", data, bucket, f.scope);
    await saveDraftSettingsRecord(f.id, 1, snapshot.settings);
    expect((await getPublishedEvent(f.slug))?.features.potluck).toBe(true);
    await publishEventRecord(f.id, { details: 1, artwork: 0, settings: 2, publication: 1 }, null);
    expect(await listPublicPotluckItems(f.scope)).toEqual([]); expect(await getPotluckClaim(data.editToken, f.scope)).toBeNull();
    expect((await writePotluckClaim("create", input(f.key), bucket, f.scope)).status).toBe("missing");
    const disabled = await fixture(5, false);
    state.fail = true; expect(await listPublicPotluckItems(disabled.scope)).toEqual([]);
    await expect(writePotluckClaim("create", input(disabled.key), bucket, disabled.scope)).rejects.toThrow("not available");
  });
  it.each(["unpublished", "archived"])("hides data and blocks guest writes for %s events", async visibility => {
    const f = await fixture(), data = input(f.key); await writePotluckClaim("create", data, bucket, f.scope);
    await db.query("UPDATE event_publications SET visibility=$1,rsvps_open=false WHERE slug=$2", [visibility, f.slug]);
    expect(await listPublicPotluckItems(f.scope)).toEqual([]); expect(await getPotluckClaim(data.editToken, f.scope)).toBeNull();
    expect((await writePotluckClaim("create", input(f.key), bucket, f.scope)).status).toBe("missing");
    expect((await listHostPotluckItems(f.slug))[0].claims).toHaveLength(1);
  });
  it("supports safe host edits, close/reopen and release without deleting the guest link", async () => {
    const f = await fixture(), data = input(f.key); await writePotluckClaim("create", data, bucket, f.scope);
    expect(await saveHostPotluckItem(f.slug, { ...f.item, revision: 1, needed: 1 })).toBe("below_claimed");
    expect(await saveHostPotluckItem(f.slug, { ...f.item, revision: 1, archived: true })).toBe("saved");
    expect(await listPublicPotluckItems(f.scope)).toEqual([]);
    expect((await writePotluckClaim("create", input(f.key), bucket, f.scope)).status).toBe("closed");
    expect((await writePotluckClaim("cancel", { ...data, revision: 1 }, bucket, f.scope)).status).toBe("saved");
    expect(await saveHostPotluckItem(f.slug, { ...f.item, revision: 2 })).toBe("saved");
    expect((await writePotluckClaim("update", { ...data, revision: 2 }, bucket, f.scope)).status).toBe("saved");
    const claim = (await listHostPotluckItems(f.slug))[0].claims[0];
    expect(await releaseHostPotluckClaim(f.slug, claim.id)).toBe(true);
    expect((await getPotluckClaim(data.editToken, f.scope))?.quantity).toBe(0);
  });
  it("protects host operations, retries creates safely and refuses stale item edits", async () => {
    const f = await fixture();
    expect(await saveHostPotluckItem(f.slug, f.item)).toBe("saved");
    expect(await saveHostPotluckItem(f.slug, { ...f.item, needed: 6 })).toBe("conflict");
    expect(await saveHostPotluckItem(f.slug, { ...f.item, revision: 1, needed: 6 })).toBe("saved");
    expect(await saveHostPotluckItem(f.slug, { ...f.item, revision: 1, needed: 7 })).toBe("conflict");
    state.auth = false;
    await expect(listHostPotluckItems(f.slug)).rejects.toThrow("Host access");
    await expect(saveHostPotluckItem(f.slug, f.item)).rejects.toThrow("Host access");
    await expect(releaseHostPotluckClaim(f.slug, randomUUID())).rejects.toThrow("Host access");
  });
  it("rate-limits fresh claims, not idempotent retries or cancellations", async () => {
    const f = await fixture(100), data = input(f.key, { quantity: 1 });
    await writePotluckClaim("create", data, bucket, f.scope);
    for (let i = 0; i < 9; i++) expect((await writePotluckClaim("create", input(f.key, { quantity: 1 }), bucket, f.scope)).status).toBe("saved");
    expect((await writePotluckClaim("create", input(f.key, { quantity: 1 }), bucket, f.scope)).status).toBe("throttled");
    expect((await writePotluckClaim("create", data, bucket, f.scope)).status).toBe("saved");
    expect((await writePotluckClaim("cancel", { ...data, revision: 1 }, bucket, f.scope)).status).toBe("saved");
  });
  it("returns friendly action failures, never fake success or database details", async () => {
    const f = await fixture(), data = input(f.key);
    for (const patch of [{ guestName: " " }, { quantity: 0 }, { quantity: 21 }, { quantity: 1.5 }, { quantity: "2" }, { editToken: f.key }]) expect((await saveGuestPotluckClaim("create", { ...data, ...patch }, f.slug)).ok).toBe(false);
    expect((await saveGuestPotluckClaim("create", data, f.slug)).ok).toBe(true);
    state.fail = true;
    const result = await saveGuestPotluckClaim("create", input(f.key), f.slug);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|password|postgresql/);
  });
  it("reapplies the additive migration without changing items, claims or flags", async () => {
    const f = await fixture(), data = input(f.key); await writePotluckClaim("create", data, bucket, f.scope);
    const before = await listHostPotluckItems(f.slug), publication = await getPublishedEvent(f.slug);
    await db.exec(await readFile("db/migrations/022_bring_something.sql", "utf8"));
    expect(await listHostPotluckItems(f.slug)).toEqual(before); expect(await getPublishedEvent(f.slug)).toEqual(publication);
  });
});
