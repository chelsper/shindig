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
import { saveHubSectionVisibility } from "../app/admin/events/[id]/content/actions";
import { getHostHubContentEvent } from "../lib/server/host-hub-content";
import { getHostHubPreview } from "../lib/server/host-hub-preview";
import { getHostingOverview } from "../lib/server/hosting-overview";
import { hostScopeArgs } from "../lib/server/host-event";
import { resolvePublicEventScope } from "../lib/server/event-scope";
import { getEventPublication, publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { savePotluckItem } from "../app/admin/potluck/actions";
import { createHostUpdate, editHostUpdate } from "../app/admin/updates/actions";
import { saveHostPoll, setHostPollStatus } from "../app/admin/polls/actions";
import { answerGuestQuestion, deleteGuestQuestion, saveHostFaq } from "../app/admin/questions/actions";
import { listHostPotluckItems, listPublicPotluckItems, writePotluckClaim } from "../lib/server/potluck";
import { listHostUpdatesForAdmin, listPublicHostUpdates } from "../lib/server/updates";
import { listPollsForAdmin, listPublicPolls } from "../lib/server/polls";
import { insertGuestQuestion, insertHostFaq, updateHostFaq, listQuestionsForAdmin, listPublicQuestions } from "../lib/server/questions";
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
  it("previews prepared content before publication with only guest-facing fields and no writes", async () => {
    const f = await fixture(); await prepare(f);
    const before = await db.query("SELECT (SELECT count(*) FROM event_publications) AS publications,(SELECT count(*) FROM potluck_claims) AS claims,(SELECT count(*) FROM poll_votes) AS votes");
    const preview = (await getHostHubPreview(f.id))!;
    expect(preview.potluck).toEqual({ state: "ready", live: false, items: [{ title: "Bags of ice", note: "10 lb bags", needed: 4, claimed: 0 }] });
    expect(preview.updates.items).toHaveLength(1); expect(preview.polls.items).toHaveLength(1);
    expect(preview.polls.items[0].options[0]).toEqual({ text: pollInput.options[0].text, count: null });
    expect(preview.polls.items[0].responses).toBeNull();
    const serialized = JSON.stringify(preview);
    for (const privateValue of [f.id, f.key, f.pollKey, f.updateId, "guestName", "editToken", "revision"]) expect(serialized).not.toContain(privateValue);
    expect(await db.query("SELECT (SELECT count(*) FROM event_publications) AS publications,(SELECT count(*) FROM potluck_claims) AS claims,(SELECT count(*) FROM poll_votes) AS votes")).toEqual(before);
    state.host = "bob"; expect(await getHostHubPreview(f.id)).toBeNull();
    state.host = null; await expect(getHostHubPreview(f.id)).rejects.toThrow("Host access");
  });
  it("matches the guest content filters and ordering while excluding pending questions, draft polls and archived items", async () => {
    const f = await fixture(); await prepare(f); await publishEventRecord(f.id, versions, null);
    const guest = (await resolvePublicEventScope(f.slug))!;
    const questionIds: string[] = [];
    for (const text of ["Private pending question", "Approved question A", "Approved question B"]) {
      await insertGuestQuestion({ requestToken: randomUUID(), question: text, guestName: "Private respondent" }, guest);
      questionIds.push((await listQuestionsForAdmin(f.scope)).find(q => q.question === text)!.id);
    }
    await answerGuestQuestion(questionIds[1], { answer: "Answer A", isPublished: true }, f.slug);
    await answerGuestQuestion(questionIds[2], { answer: "Answer B", isPublished: true }, f.slug);
    const other = await fixture(); await prepare(other);
    const draftKey = randomUUID();
    await saveHostPoll(draftKey, { ...pollInput, question: "Private draft poll", options: pollInput.options.map(o => ({ ...o, key: randomUUID() })) }, true, f.slug);
    await savePotluckItem({ key: randomUUID(), title: "Archived item", note: "Private archive", needed: 2, archived: true, revision: 0 }, f.slug);
    const token = createRsvpEditToken();
    expect((await writePotluckClaim("create", { itemKey: f.key, editToken: token, guestName: "Private claimant", quantity: 2, revision: 0 }, "b".repeat(64), guest)).status).toBe("saved");
    await setHostPollStatus(f.pollKey, "CLOSED", false, f.slug);
    let preview = (await getHostHubPreview(f.id))!;
    expect(preview.questions.items).toEqual(await listPublicQuestions(guest));
    expect(preview.updates.items).toEqual(await listPublicHostUpdates(guest));
    expect(preview.potluck.items).toEqual((await listPublicPotluckItems(guest)).map(({ title, note, needed, claimed }) => ({ title, note, needed, claimed })));
    expect(preview.potluck.items[0].claimed).toBe(2);
    expect(preview.polls.items).toHaveLength(1); expect(preview.polls.items[0].status).toBe("CLOSED"); expect(preview.polls.items[0].responses).toBe(0);
    const serialized = JSON.stringify(preview);
    for (const privateValue of ["Private pending", "Private respondent", "Private claimant", "Private draft poll", "Archived item", token, other.id, ...questionIds]) expect(serialized).not.toContain(privateValue);
    await changeEventLifecycleRecord(f.id, 1, "unpublish");
    preview = (await getHostHubPreview(f.id))!;
    expect(preview.questions.live).toBe(false); expect(preview.questions.items).toHaveLength(2);
    expect(await listPublicQuestions(guest)).toEqual([]);
  });
  it("uses saved draft feature choices without falsely declaring new private features live", async () => {
    const f = await fixture(); await prepare(f);
    const disabled = { ...settings, features: { ...settings.features, potluck: false, polls: false, questions: false, updates: false } };
    await saveDraftSettingsRecord(f.id, 1, disabled);
    await publishEventRecord(f.id, { ...versions, settings: 2 }, null);
    let preview = (await getHostHubPreview(f.id))!;
    expect(Object.values(preview).every(s => s.state === "disabled" && s.items.length === 0)).toBe(true);
    await saveDraftSettingsRecord(f.id, 2, settings);
    preview = (await getHostHubPreview(f.id))!;
    expect(preview.potluck.state).toBe("ready"); expect(preview.potluck.live).toBe(false);
    expect(preview.potluck.items).toHaveLength(1);
  });
  it("saves inline visibility without publishing, preserving other fields and protecting against stale tabs and other owners", async () => {
    const f = await fixture(); await prepare(f);
    const disabled = { ...settings, features: { ...settings.features, potluck: false } };
    await saveDraftSettingsRecord(f.id, 1, disabled);
    await publishEventRecord(f.id, { ...versions, settings: 2 }, null);
    const guest = (await resolvePublicEventScope(f.slug))!;
    const input = { id: f.id, revision: 2, section: "potluck", enabled: true };
    state.host = "bob"; expect((await saveHubSectionVisibility(input)).ok).toBe(false);
    state.host = "alice"; expect(await saveHubSectionVisibility(input)).toEqual({ ok: true, enabled: true, revision: 3 });
    expect(await saveHubSectionVisibility(input)).toMatchObject({ ok: false, conflict: true });
    expect((await getHostHubContentEvent(f.id))?.settings.settings).toMatchObject(settings);
    expect((await getEventPublication(f.slug))?.snapshot.settings.features.potluck).toBe(false);
    expect(await listPublicPotluckItems(guest)).toEqual([]);
    await publishEventRecord(f.id, { ...versions, settings: 3, publication: 1 }, null);
    expect(await listPublicPotluckItems((await resolvePublicEventScope(f.slug))!)).toHaveLength(1);
    expect(await saveHubSectionVisibility({ ...input, revision: 3, enabled: false })).toEqual({ ok: true, revision: 4, enabled: false });
    expect(await listPublicPotluckItems((await resolvePublicEventScope(f.slug))!)).toHaveLength(1);
    await publishEventRecord(f.id, { ...versions, settings: 4, publication: 2 }, null);
    expect(await listPublicPotluckItems((await resolvePublicEventScope(f.slug))!)).toEqual([]);
    expect(await listHostPotluckItems(f.slug)).toHaveLength(1);
  });
  it("summarizes only the owned event, including hidden attendance and excluding canceled/closed signup quantities", async () => {
    const f = await fixture(); await prepare(f); await publishEventRecord(f.id, versions, null);
    const guest = (await resolvePublicEventScope(f.slug))!;
    const other = await fixture(); await prepare(other);
    for (const [slug, attending, size, visible] of [[f.slug, true, 2, true], [f.slug, true, 3, false], [f.slug, false, null, false], [other.slug, true, 20, true]]) {
      await db.query("INSERT INTO rsvps(id,event_slug,guest_name,attending,party_size,display_on_guest_list,comment) VALUES($1,$2,'Private RSVP name',$3,$4,$5,'Private RSVP note')", [randomUUID(), slug, attending, size, visible]);
    }
    const active = createRsvpEditToken(), canceled = createRsvpEditToken();
    for (const token of [active, canceled]) expect((await writePotluckClaim("create", { itemKey: f.key, editToken: token, guestName: "Private signup", quantity: 2, revision: 0 }, "b".repeat(64), guest)).status).toBe("saved");
    expect((await writePotluckClaim("cancel", { itemKey: f.key, editToken: canceled, guestName: "Private signup", quantity: 0, revision: 1 }, "b".repeat(64), guest)).status).toBe("saved");
    await savePotluckItem({ key: randomUUID(), title: "Second request", note: "", needed: 2, archived: false, revision: 0 }, f.slug);
    const closed = randomUUID();
    await savePotluckItem({ key: closed, title: "Closed request", note: "", needed: 7, archived: false, revision: 0 }, f.slug);
    expect((await writePotluckClaim("create", { itemKey: closed, editToken: createRsvpEditToken(), guestName: "Private closed signup", quantity: 3, revision: 0 }, "b".repeat(64), guest)).status).toBe("saved");
    await savePotluckItem({ key: closed, title: "Closed request", note: "", needed: 7, archived: true, revision: 1 }, f.slug);
    for (let i = 0; i < 3; i++) await insertGuestQuestion({ requestToken: randomUUID(), question: `Private question ${i}`, guestName: "Private questioner" }, guest);
    const questions = await listQuestionsForAdmin(f.scope);
    await answerGuestQuestion(questions[0].id, { answer: "Private answer", isPublished: false }, f.slug);
    await answerGuestQuestion(questions[1].id, { answer: "Approved answer", isPublished: true }, f.slug);
    for (const slug of [f.slug, other.slug]) await db.query("INSERT INTO playlist_suggestions(event_slug,song_title,artist,suggested_by) VALUES($1,'Song','Artist','Private suggester')", [slug]);
    const before = await db.query("SELECT (SELECT count(*) FROM rsvps) AS rsvps,(SELECT sum(quantity) FROM potluck_claims) AS quantities,(SELECT sum(revision) FROM event_publications) AS revisions");
    const data = (await getHostingOverview(f.id))!;
    expect(data.rsvps).toEqual({ totalAttending: 2, totalResponses: 3, declined: 1, totalPartySize: 5 });
    expect(data.potluck).toEqual({ items: 2, needed: 6, covered: 2, remaining: 4, uncoveredItems: 2 });
    expect(data.questions).toEqual({ total: 3, unanswered: 1, answeredPrivate: 1, approved: 1 });
    expect(data.playlist).toEqual({ total: 1 }); expect(data.polls).toEqual({ total: 1, open: 1, drafts: 0, closed: 0 }); expect(data.updates).toEqual({ total: 1 });
    for (const value of ["Private RSVP", "Private signup", "Private question", "Private answer", "Private suggester", active, canceled, f.id, f.key, other.id, "Approved answer", "Song"]) expect(JSON.stringify(data)).not.toContain(value);
    expect(await db.query("SELECT (SELECT count(*) FROM rsvps) AS rsvps,(SELECT sum(quantity) FROM potluck_claims) AS quantities,(SELECT sum(revision) FROM event_publications) AS revisions")).toEqual(before);
    await changeEventLifecycleRecord(f.id, 1, "archive");
    expect((await getHostingOverview(f.id))?.rsvps).toEqual(data.rsvps);
    state.host = "bob"; expect(await getHostingOverview(f.id)).toBeNull();
    state.host = null; await expect(getHostingOverview(f.id)).rejects.toThrow("Host access");
  });
  it("keeps truly empty drafts at zero without publishing them", async () => {
    const f = await fixture(); const data = (await getHostingOverview(f.id))!;
    expect(data.rsvps).toEqual({ totalAttending: 0, totalResponses: 0, declined: 0, totalPartySize: 0 });
    expect(data.potluck).toEqual({ items: 0, needed: 0, covered: 0, remaining: 0, uncoveredItems: 0 });
    expect(data.questions?.total).toBe(0); expect(await getEventPublication(f.slug)).toBeNull();
  });
  it("prepares FAQs privately, previews only approved answers, and publishes through the existing questions gate", async () => {
    const f = await fixture(); const key = randomUUID();
    const faq = { question: " Where should we park? ", answer: " Along the driveway. ", isPublished: false };
    expect(await saveHostFaq(key, 0, faq, f.slug)).toEqual({ ok: true });
    let saved = (await listQuestionsForAdmin(f.scope))[0];
    expect(saved).toMatchObject({ question: "Where should we park?", answer: "Along the driveway.", source: "host", guestName: null, revision: 1, isPublished: false });
    expect(await listPublicQuestions(f.scope)).toEqual([]); expect((await getHostHubPreview(f.id))?.questions.items).toEqual([]);
    expect(await saveHostFaq(saved.id, 1, { ...faq, isPublished: true }, f.slug)).toEqual({ ok: true });
    const publicShape = [{ question: "Where should we park?", answer: "Along the driveway." }];
    expect((await getHostHubPreview(f.id))?.questions.items).toEqual(publicShape);
    expect(await listPublicQuestions(f.scope)).toEqual([]); expect(await getEventPublication(f.slug)).toBeNull();
    await publishEventRecord(f.id, versions, null);
    const guest = (await resolvePublicEventScope(f.slug))!;
    expect(await listPublicQuestions(guest)).toEqual(publicShape);
    expect((await getHostingOverview(f.id))?.questions).toEqual({ total: 1, unanswered: 0, answeredPrivate: 0, approved: 1 });
    saved = (await listQuestionsForAdmin(f.scope))[0];
    expect(await saveHostFaq(saved.id, saved.revision, { ...faq, isPublished: false }, f.slug)).toEqual({ ok: true });
    expect(await listPublicQuestions(guest)).toEqual([]); expect((await getHostHubPreview(f.id))?.questions.items).toEqual([]);
  });
  it("protects FAQs across owners/events and prevents rewriting guest submissions as FAQs", async () => {
    const f = await fixture(); const other = await fixture();
    const faq = { question: "Kids welcome?", answer: "Yes.", isPublished: false };
    await saveHostFaq(randomUUID(), 0, faq, f.slug);
    const saved = (await listQuestionsForAdmin(f.scope))[0];
    expect((await saveHostFaq(saved.id, 1, { ...faq, answer: "Intrusion" }, other.slug)).ok).toBe(false);
    expect((await answerGuestQuestion(saved.id, { answer: null, isPublished: false }, f.slug)).ok).toBe(false);
    await publishEventRecord(f.id, versions, null);
    await insertGuestQuestion({ requestToken: randomUUID(), question: "Private guest question", guestName: "Guest name" }, (await resolvePublicEventScope(f.slug))!);
    const guest = (await listQuestionsForAdmin(f.scope)).find(q => q.source === "guest")!;
    expect((await saveHostFaq(guest.id, 1, faq, f.slug)).ok).toBe(false);
    state.host = "bob";
    await expect(insertHostFaq(randomUUID(), faq, f.scope)).rejects.toThrow();
    await expect(updateHostFaq(saved.id, 1, faq, f.scope)).rejects.toThrow();
    expect((await saveHostFaq(randomUUID(), 0, faq, f.slug)).ok).toBe(false);
    expect((await deleteGuestQuestion(saved.id, true, f.slug)).ok).toBe(false);
    state.host = "alice";
    expect((await listQuestionsForAdmin(f.scope)).find(q => q.id === saved.id)).toEqual(saved);
    expect((await listQuestionsForAdmin(f.scope)).find(q => q.id === guest.id)).toEqual(guest);
    expect(await deleteGuestQuestion(saved.id, false, f.slug)).toMatchObject({ ok: false });
    expect(await deleteGuestQuestion(saved.id, true, f.slug)).toEqual({ ok: true });
    expect(await listQuestionsForAdmin(f.scope)).toEqual([guest]);
  });
  it("deduplicates FAQ retries without clobbering edits and rejects stale revisions", async () => {
    const f = await fixture(); const key = randomUUID();
    const faq = { question: "What is provided?", answer: "Snacks.", isPublished: false };
    const results = await Promise.all([saveHostFaq(key, 0, faq, f.slug), saveHostFaq(key.toUpperCase(), 0, faq, f.slug)]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(await listQuestionsForAdmin(f.scope)).toHaveLength(1);
    const row = (await listQuestionsForAdmin(f.scope))[0];
    const edited = { ...faq, answer: "Snacks and drinks.", isPublished: true };
    expect(await saveHostFaq(row.id, 1, edited, f.slug)).toEqual({ ok: true });
    expect(await saveHostFaq(row.id, 1, edited, f.slug)).toEqual({ ok: true }); // Lost response retry.
    expect((await listQuestionsForAdmin(f.scope))[0].revision).toBe(2);
    expect((await saveHostFaq(row.id, 1, { ...edited, answer: "Stale" }, f.slug)).ok).toBe(false);
    expect((await saveHostFaq(key, 0, faq, f.slug)).ok).toBe(false);
    expect((await listQuestionsForAdmin(f.scope))[0].answer).toBe(edited.answer);
    const timestamps = (await db.query("SELECT created_at, updated_at, submission_hash, published_at FROM event_questions WHERE id=$1", [row.id])).rows[0];
    expect(new Date(timestamps.updated_at as string).getTime()).toBeGreaterThanOrEqual(new Date(timestamps.created_at as string).getTime());
    expect(timestamps.submission_hash).not.toContain(key); expect(timestamps.published_at).not.toBeNull();
  });
  it("hides FAQs when the module is disabled or event archived, including with stale public scopes", async () => {
    const f = await fixture();
    await saveHostFaq(randomUUID(), 0, { question: "What to wear?", answer: "Come casual.", isPublished: true }, f.slug);
    await publishEventRecord(f.id, versions, null); const guest = (await resolvePublicEventScope(f.slug))!;
    expect(await listPublicQuestions(guest)).toHaveLength(1);
    await saveDraftSettingsRecord(f.id, 1, { ...settings, features: { ...settings.features, questions: false } });
    expect(await listPublicQuestions(guest)).toHaveLength(1); // Not published yet.
    await publishEventRecord(f.id, { ...versions, settings: 2, publication: 1 }, null);
    expect(await listPublicQuestions(guest)).toEqual([]);
    expect((await getHostHubPreview(f.id))?.questions.state).toBe("disabled");
    await changeEventLifecycleRecord(f.id, 2, "archive");
    expect(await listPublicQuestions(guest)).toEqual([]); expect(await listQuestionsForAdmin(f.scope)).toHaveLength(1);
  });
  it("reapplies migration 024 safely and enforces FAQ identity constraints in Postgres", async () => {
    const f = await fixture(); await publishEventRecord(f.id, versions, null);
    await insertGuestQuestion({ requestToken: randomUUID(), question: "Existing guest question", guestName: "Private name" }, (await resolvePublicEventScope(f.slug))!);
    const key = randomUUID(); await saveHostFaq(key, 0, { question: "Parking?", answer: "Driveway", isPublished: true }, f.slug);
    const before = await listQuestionsForAdmin(f.scope);
    await db.exec(await readFile("db/migrations/024_host_faqs.sql", "utf8"));
    expect(await listQuestionsForAdmin(f.scope)).toEqual(before);
    const faq = before.find(q => q.source === "host")!;
    await expect(db.query("UPDATE event_questions SET guest_name='Not a guest' WHERE id=$1", [faq.id])).rejects.toThrow();
    await expect(db.query("UPDATE event_questions SET source='fake' WHERE id=$1", [faq.id])).rejects.toThrow();
    await expect(db.query("UPDATE event_questions SET faq_revision=0 WHERE id=$1", [faq.id])).rejects.toThrow();
    expect(await listPublicQuestions((await resolvePublicEventScope(f.slug))!)).toEqual([{ question: "Parking?", answer: "Driveway" }]);
  });
});
