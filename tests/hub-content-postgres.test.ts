// All data is synthetic, in disposable embedded PostgreSQL. Never Neon.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ host: "alice" as string | null }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => false }));
vi.mock("../lib/server/host-auth", () => ({ getHostAccountSession: async () => state.host ? { id: state.host, name: state.host, email: `${state.host}@example.test` } : null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getHostHubContentEvent } from "../lib/server/host-hub-content";
import { hostScopeArgs } from "../lib/server/host-event";
import { resolvePublicEventScope } from "../lib/server/event-scope";
import { getEventPublication, publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { savePotluckItem } from "../app/admin/potluck/actions";
import { createHostUpdate, editHostUpdate } from "../app/admin/updates/actions";
import { saveHostPoll, setHostPollStatus } from "../app/admin/polls/actions";
import { answerGuestQuestion } from "../app/admin/questions/actions";
import { listHostPotluckItems, listPublicPotluckItems, writePotluckClaim } from "../lib/server/potluck";
import { listHostUpdatesForAdmin, listPublicHostUpdates } from "../lib/server/updates";
import { listPollsForAdmin, listPublicPolls } from "../lib/server/polls";
import { insertGuestQuestion, listQuestionsForAdmin, listPublicQuestions } from "../lib/server/questions";
import { createRsvpEditToken } from "../lib/rsvp-edit-token";
import { draft, snapshot } from "./fixtures/publication";
import { pollInput } from "./fixtures/polls";
const modulePath = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  return (await db.query(parts.reduce((s, p, i) => s + p + (i < values.length ? `$${i + 1}` : ""), ""), values)).rows;
}
const settings = { ...snapshot.settings, features: { ...snapshot.settings.features, weather: false, potluck: true, questions: true, updates: true, polls: true } };
const versions = { details: 1, settings: 1, artwork: 0, publication: 0 };
async function fixture() {
  const id = randomUUID(), slug = `event-${id}`;
  await saveEventDraftRecord(id, 0, draft);
  await saveDraftSettingsRecord(id, 0, settings);
  const data = (await getHostHubContentEvent(id))!;
  return { id, slug, scope: data.scope, updateId: randomUUID(), key: randomUUID(), pollKey: randomUUID() };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  const item = { key: f.key, title: "Bags of ice", note: "10 lb bags", needed: 4, archived: false, revision: 0 };
  expect((await savePotluckItem(item, f.slug)).ok).toBe(true);
  expect((await savePotluckItem(item, f.slug)).ok).toBe(true);
  expect(await createHostUpdate(f.updateId, { heading: "Parking", message: "Use the side gate." }, f.slug)).toEqual({ ok: true });
  expect(await createHostUpdate(f.updateId, { heading: "Parking", message: "Use the side gate." }, f.slug)).toEqual({ ok: true });
  const poll = { ...pollInput, options: pollInput.options.map(option => ({ ...option, key: randomUUID() })) };
  expect((await saveHostPoll(f.pollKey, poll, true, f.slug)).ok).toBe(true);
  expect((await setHostPollStatus(f.pollKey, "OPEN", false, f.slug)).ok).toBe(true);
}
describe.skipIf(!modulePath)("private Hub Content preparation and publication", () => {
  beforeAll(async () => {
    if (!modulePath || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(modulePath)) throw Error("Disposable PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ modulePath); db = new PGlite();
    for (const name of (await readdir("db/migrations")).filter(n => n.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${name}`, "utf8"));
    await db.exec(`INSERT INTO host_users(id,name,email,"emailVerified") VALUES ('alice','Alice','alice@example.test',true),('bob','Bob','bob@example.test',true)`);
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/hub_content_test");
  }, 30000);
  beforeEach(() => { state.host = "alice"; });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });
  it("prepares through real server actions before publication without exposing content or creating duplicate rows", async () => {
    const f = await fixture(); await prepare(f);
    expect(await getEventPublication(f.slug)).toBeNull();
    expect(await resolvePublicEventScope(f.slug)).toBeNull();
    expect(await listHostPotluckItems(f.slug)).toHaveLength(1);
    expect(await listHostUpdatesForAdmin(f.scope)).toHaveLength(1);
    expect(await listPollsForAdmin(f.scope)).toHaveLength(1);
    // Even accidental use of a valid host scope at the public DAL cannot leak.
    for (const read of [listPublicPotluckItems, listPublicHostUpdates, listPublicPolls, listPublicQuestions]) expect(await read(f.scope)).toEqual([]);
    expect((await writePotluckClaim("create", { itemKey: f.key, editToken: createRsvpEditToken(), guestName: "Blocked", quantity: 1, revision: 0 }, "a".repeat(64), f.scope)).status).toBe("missing");
    expect((await db.query("SELECT count(*)::int AS total FROM rsvps WHERE event_slug=$1", [f.slug])).rows[0].total).toBe(0);
  });
  it("keeps draft ownership enforced for reads, writes and legacy event fallback", async () => {
    const f = await fixture(); await prepare(f); state.host = "bob";
    expect(await getHostHubContentEvent(f.id)).toBeNull();
    await expect(hostScopeArgs(f.slug)).rejects.toThrow("unavailable");
    await expect(listHostPotluckItems(f.slug)).rejects.toThrow();
    await expect(listHostUpdatesForAdmin(f.scope)).rejects.toThrow();
    expect((await savePotluckItem({ key: f.key, title: "Intrusion", note: "", needed: 2, archived: false, revision: 1 }, f.slug)).ok).toBe(false);
    expect((await editHostUpdate(f.updateId, { message: "Intrusion" }, f.slug)).ok).toBe(false);
    expect((await setHostPollStatus(f.pollKey, "CLOSED", false, f.slug)).ok).toBe(false);
    for (const slug of [undefined, "oyster-roast-2026", "bad-slug"]) await expect(hostScopeArgs(slug)).rejects.toThrow();
    state.host = "alice"; expect((await listHostPotluckItems(f.slug))[0].title).toBe("Bags of ice");
  });
  it("reveals prepared content only with explicitly published features and hides it again when unpublished", async () => {
    const f = await fixture(); await prepare(f);
    expect(await publishEventRecord(f.id, versions, null)).toBe(1);
    const guest = (await resolvePublicEventScope(f.slug))!;
    expect(await listPublicPotluckItems(guest)).toHaveLength(1);
    expect(await listPublicHostUpdates(guest)).toEqual([expect.objectContaining({ heading: "Parking", message: "Use the side gate." })]);
    expect(await listPublicPolls(guest)).toHaveLength(1);
    const privatePoll = randomUUID();
    await saveHostPoll(privatePoll, { ...pollInput, options: pollInput.options.map(o => ({ ...o, key: randomUUID() })) }, true, f.slug);
    expect(await listPublicPolls(guest)).toHaveLength(1); // DRAFT is never public.
    await saveDraftSettingsRecord(f.id, 1, { ...settings, features: { ...settings.features, updates: false, polls: false, potluck: false } });
    expect(await publishEventRecord(f.id, { ...versions, settings: 2, publication: 1 }, null)).toBe(2);
    for (const read of [listPublicPotluckItems, listPublicHostUpdates, listPublicPolls]) expect(await read(guest)).toEqual([]); // Rechecks stale scopes.
    expect(await changeEventLifecycleRecord(f.id, 2, "unpublish")).toBe(3);
    expect(await resolvePublicEventScope(f.slug)).toBeNull();
    expect(await listHostUpdatesForAdmin(f.scope)).toHaveLength(1);
  });
  it("keeps submitted questions private until the host answers and approves them, excluding the guest name", async () => {
    const f = await fixture(); await publishEventRecord(f.id, versions, null);
    const guest = (await resolvePublicEventScope(f.slug))!;
    await insertGuestQuestion({ requestToken: randomUUID(), question: "Where do we park?", guestName: "Private guest name" }, guest);
    expect(await listPublicQuestions(guest)).toEqual([]);
    const question = (await listQuestionsForAdmin(f.scope))[0];
    expect(await answerGuestQuestion(question.id, { answer: "Near the gate", isPublished: false }, f.slug)).toEqual({ ok: true });
    expect(await listPublicQuestions(guest)).toEqual([]);
    expect(await answerGuestQuestion(question.id, { answer: "Near the gate", isPublished: true }, f.slug)).toEqual({ ok: true });
    expect(await listPublicQuestions(guest)).toEqual([{ question: "Where do we park?", answer: "Near the gate" }]);
    await changeEventLifecycleRecord(f.id, 1, "unpublish");
    expect(await listPublicQuestions(guest)).toEqual([]);
  });
  it("rejects unauthenticated access and invalid writes without publishing", async () => {
    const f = await fixture();
    expect((await createHostUpdate(f.updateId, { message: " " }, f.slug)).ok).toBe(false);
    expect((await savePotluckItem({ key: f.key, title: "Ice", note: "", needed: 0, archived: false, revision: 0 }, f.slug)).ok).toBe(false);
    state.host = null;
    await expect(getHostHubContentEvent(f.id)).rejects.toThrow("Host access");
    expect((await createHostUpdate(f.updateId, { message: "Unauthorized" }, f.slug)).ok).toBe(false);
    expect(await getEventPublication(f.slug)).toBeNull();
  });
  it("reapplies migration 023 without seeding, publishing, or changing saved content", async () => {
    const f = await fixture(); await prepare(f);
    const before = await listHostPotluckItems(f.slug);
    await db.exec(await readFile("db/migrations/023_draft_hub_content.sql", "utf8"));
    expect(await listHostPotluckItems(f.slug)).toEqual(before);
    expect(await getEventPublication(f.slug)).toBeNull();
  });
});
