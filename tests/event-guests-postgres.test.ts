// Opt-in real PostgreSQL workflow. Never connects to Neon or production.
// Run with SHINDIG_TEST_PG_SOCKET pointing to a /private/tmp Unix socket,
// SHINDIG_TEST_PSQL pointing to psql, and SHINDIG_TEST_PG_PORT (default 55441).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.authenticated }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getDraftArtwork, saveDraftArtworkRecord } from "../lib/server/event-draft-artwork";
import { createPlaylistSuggestion, listPlaylistSuggestionsForAdmin } from "../lib/server/playlist";
import { insertGuestQuestion, listQuestionsForAdmin } from "../lib/server/questions";
import { insertHostUpdate, listHostUpdatesForAdmin } from "../lib/server/updates";
import { savePoll, listPollsForAdmin } from "../lib/server/polls";
import { rsvpsToCsv } from "../lib/server/rsvp-csv";
import { getPublishedEvent, getHostEventPublication, publishEventRecord, changeEventLifecycleRecord, listHostPublications, isEventAliasAvailable } from "../lib/server/event-publications";
import { resolvePublicEventScope, resolveHostEventScope, OYSTER_ROAST_SCOPE } from "../lib/server/event-scope";
import { submitEventRsvp, updateEventRsvp } from "../app/e/actions";
import { createEventGuest, updateEventGuest, deleteEventGuest } from "../app/admin/events/[id]/guests/actions";
import { getRsvpForAdmin, getRsvpForGuest, getPublicGuestList, getRsvpSummary, listRsvps, saveRsvp, updateRsvpForGuest } from "../lib/server/rsvps";
import { hostScopeArgs } from "../lib/server/host-event";
import { hashRsvpEditToken } from "../lib/server/rsvp-edit-token";
import { createOysterRoastIcs } from "../lib/calendar";
import { RESERVED_EVENT_ALIASES } from "../lib/event-alias";
import { draft, snapshot } from "./fixtures/publication";

const socket = process.env.SHINDIG_TEST_PG_SOCKET;
const embeddedModule = process.env.SHINDIG_TEST_PGLITE;
let embedded: { query: (text: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> } | undefined;
const run = promisify(execFile);
async function sql(text: string) {
  if (!socket || !/^\/private\/tmp\/[a-zA-Z0-9._/-]+$/.test(socket)) throw new Error("A disposable local PostgreSQL socket is required.");
  const { stdout } = await run(process.env.SHINDIG_TEST_PSQL || "psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", process.env.SHINDIG_TEST_PG_PORT || "55441", "-d", "shindig_drafts_test", "-c", text]);
  return stdout.trim();
}
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error("Unsupported test parameter");
}
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (embedded) {
    const statement = parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), "");
    return (await embedded.query(statement, values)).rows;
  }
  const statement = parts.reduce((text, part, index) => text + part + (index < values.length ? literal(values[index]) : ""), "");
  return JSON.parse(await sql(`WITH result AS (${statement}) SELECT coalesce(json_agg(result), '[]'::json) FROM result`));
}
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const slugs = ids.map((id) => `event-${id}`);
const aliases = ids.map((id) => `test-${id}`);
const responseId = randomUUID(), hiddenId = randomUUID(), hostId = randomUUID();
const token = "b".repeat(43), hiddenToken = "c".repeat(43);
const fields = { guestName: "Synthetic Visible", attending: true, partySize: 2, displayOnGuestList: true, comment: "Guest note" };
const initial = { error: null };
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ guestName: "Host Added", attending: "true", partySize: "2", displayOnGuestList: "on", comment: "Host note", ...values })) data.set(key, value);
  return data;
}
describe.skipIf(!socket && !embeddedModule)("real local publish → RSVP → host guest management workflow", () => {
  let legacyBefore: unknown;
  beforeAll(async () => {
    if (embeddedModule) {
      if (!/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embeddedModule)) throw new Error("Use a temporary local PGlite installation only.");
      const { PGlite } = await import(/* @vite-ignore */ embeddedModule);
      embedded = new PGlite(); // Fresh in-memory PostgreSQL, never a saved database.
      for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await embedded!.exec(await readFile(`db/migrations/${file}`, "utf8"));
    } else {
      expect(await sql("SELECT current_database()" )).toBe("shindig_drafts_test");
      expect(await sql("SHOW standard_conforming_strings")).toBe("on");
    }
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/shindig_drafts_test");
    legacyBefore = await getRsvpSummary(OYSTER_ROAST_SCOPE);
  }, 30000);
  afterAll(async () => {
    if (embedded) { await embedded.close(); vi.unstubAllEnvs(); return; }
    // Only this run's random synthetic identities, in the named disposable DB.
    const events = ids.map(literal).join(","), scopes = slugs.map(literal).join(",");
    await sql(`BEGIN; DELETE FROM rsvps WHERE event_slug IN (${scopes}); DELETE FROM playlist_suggestions WHERE event_slug IN (${scopes}); DELETE FROM event_questions WHERE event_slug IN (${scopes}); DELETE FROM event_updates WHERE event_slug IN (${scopes}); DELETE FROM polls WHERE event_slug IN (${scopes}); DELETE FROM event_publications WHERE event_id IN (${events}); DELETE FROM event_draft_artwork WHERE event_id IN (${events}); DELETE FROM event_draft_settings WHERE event_id IN (${events}); DELETE FROM event_data_scopes WHERE event_id IN (${events}); DELETE FROM events WHERE id IN (${events}); COMMIT;`);
    vi.unstubAllEnvs();
  });
  it("publishes two disposable events, then enforces privacy and isolation through real queries", async () => {
    for (const id of ids.slice(0, 2)) {
      expect(await saveEventDraftRecord(id, 0, { ...draft, title: "Synthetic guest management test" })).toEqual({ id, revision: 1 });
      expect(await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, features: { ...snapshot.settings.features, playlist: false, questions: false, updates: false, polls: false } })).toBe(1);
      expect(await getPublishedEvent(`event-${id}`)).toBeNull();
      if (id === ids[1]) {
        expect(await isEventAliasAvailable(id, aliases[0])).toBe(false);
        await expect(publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null, aliases[0])).rejects.toThrow("link was just taken");
        expect(await getPublishedEvent(slugs[1])).toBeNull();
      }
      const attempts = id === ids[0] ? 2 : 1;
      expect(await Promise.all(Array.from({ length: attempts }, () => publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null, id === ids[0] ? aliases[0] : null)))).toEqual(Array(attempts).fill(1));
    }
    const a = (await resolvePublicEventScope(slugs[0]))!, b = (await resolvePublicEventScope(slugs[1]))!;
    const event = (await getPublishedEvent(slugs[0]))!;
    expect(await getPublishedEvent(aliases[0])).toEqual(event);
    expect((await resolvePublicEventScope(aliases[0]))!.slug).toBe(slugs[0]);
    expect(createOysterRoastIcs(new Date(), undefined, event).replaceAll("\r\n ", "")).toContain(`/e/${aliases[0]}/event`);
    state.authenticated = false;
    const submit = { ...fields, eventSlug: slugs[0], submissionId: responseId, editToken: token };
    expect((await submitEventRsvp(aliases[0], submit)).ok).toBe(true);
    expect((await submitEventRsvp(slugs[0], submit)).ok).toBe(true);
    expect((await submitEventRsvp(slugs[0], { ...submit, submissionId: hiddenId, editToken: hiddenToken, guestName: "Synthetic Hidden", partySize: 3, displayOnGuestList: false })).ok).toBe(true);
    expect(await getPublicGuestList(a)).toEqual({ totalGuestCount: 5, guests: [{ guestName: fields.guestName, partySize: 2 }] });
    expect(await getPublicGuestList(b)).toEqual({ totalGuestCount: 0, guests: [] });
    expect(await getRsvpForGuest(hashRsvpEditToken(token), b)).toBeNull();
    expect((await createEventGuest(ids[0], hostId, initial, form())).error).toBeTruthy();
    state.authenticated = true;
    const adds = await Promise.allSettled([createEventGuest(ids[0], hostId, initial, form()), createEventGuest(ids[0], hostId, initial, form())]);
    for (const result of adds) expect(result.status === "rejected" && String(result.reason).includes("saved=create")).toBe(true);
    expect((await getRsvpSummary(a)).totalResponses).toBe(3);
    expect((await listRsvps("attending", a, "host a"))).toHaveLength(1);
    expect((await listRsvps("all", a, "%"))).toHaveLength(0);
    expect((await updateEventGuest(ids[1], responseId, initial, form())).error).toContain("could not be found");
    expect((await deleteEventGuest(ids[1], responseId, initial, form({ confirm: "delete" }))).error).toContain("could not be found");
    expect((await deleteEventGuest(ids[0], responseId, initial, form())).error).toContain("confirm");
    const before = (await getRsvpForAdmin(responseId, a))!;
    await expect(updateEventGuest(ids[0], responseId, initial, form({ guestName: "Host Edited", attending: "false", partySize: "20" }))).rejects.toThrow("saved=update");
    const after = (await getRsvpForAdmin(responseId, a))!;
    expect(after).toMatchObject({ attending: false, partySize: null, displayOnGuestList: false, comment: "Host note", createdAt: before.createdAt });
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
    expect((await getPublicGuestList(a)).totalGuestCount).toBe(5);
    expect((await getPublicGuestList(a)).guests.map((g) => g.guestName)).toEqual(["Host Added"]);
    expect(await getRsvpForGuest(hashRsvpEditToken(token), a)).toMatchObject({ guestName: "Host Edited", attending: false });
    expect((await listRsvps("declined", a))).toHaveLength(1);
    expect((await updateEventGuest(ids[0], responseId, initial, form({ partySize: "5" }))).error).toContain("between 1 and 4");
    state.authenticated = false;
    expect((await updateEventRsvp(slugs[0], { ...fields, partySize: 4, displayOnGuestList: false, editToken: token })).ok).toBe(true);
    expect((await getPublicGuestList(a)).totalGuestCount).toBe(9);
    state.authenticated = true;
    await expect(deleteEventGuest(ids[0], responseId, initial, form({ confirm: "delete" }))).rejects.toThrow("saved=delete");
    expect(await getRsvpForGuest(hashRsvpEditToken(token), a)).toBeNull();
    expect((await getRsvpSummary(a)).totalResponses).toBe(2);
    expect((await getPublicGuestList(a)).totalGuestCount).toBe(5);
    expect(await getRsvpSummary(OYSTER_ROAST_SCOPE)).toEqual(legacyBefore);
    expect((await getRsvpSummary(b)).totalResponses).toBe(0);
    // Saved draft changes cannot silently change the active guest rules.
    await saveDraftSettingsRecord(ids[0], 1, { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, maxPartySize: 1 } });
    expect((await resolvePublicEventScope(slugs[0]))!.rsvp.maxPartySize).toBe(4);
    expect((await listHostPublications()).find((p) => p.id === ids[0])?.hasUnpublishedChanges).toBe(true);

    // Migration is idempotent and does not change an event's current controls.
    expect(await changeEventLifecycleRecord(ids[0], 1, "close-rsvps")).toBe(2);
    if (embedded) await embedded.exec(await readFile("db/migrations/015_event_lifecycle.sql", "utf8"));
    expect((await getPublishedEvent(slugs[0]))!.rsvpsOpen).toBe(false);
    expect((await getPublishedEvent(slugs[1]))!.rsvpsOpen).toBe(true);
    const closedBefore = await listRsvps("all", a);
    state.authenticated = false;
    expect((await submitEventRsvp(slugs[0], { ...submit, submissionId: randomUUID() })).ok).toBe(false);
    expect((await updateEventRsvp(slugs[0], { ...fields, editToken: hiddenToken })).ok).toBe(false);
    // A scope captured before closure cannot bypass the locked SQL admission.
    await expect(saveRsvp({ ...fields, id: randomUUID(), eventSlug: slugs[0] }, hashRsvpEditToken("d".repeat(43)), a)).rejects.toThrow();
    await expect(updateRsvpForGuest(hashRsvpEditToken(hiddenToken), { ...fields, guestName: "Must not save" }, a)).rejects.toThrow("closed RSVPs");
    expect(await listRsvps("all", a)).toEqual(closedBefore);
    state.authenticated = true;
    await expect(updateEventGuest(ids[0], hiddenId, initial, form({ guestName: "Hidden host edit", displayOnGuestList: "" }))).rejects.toThrow("saved=update");
    expect(await changeEventLifecycleRecord(ids[0], 2, "reopen-rsvps")).toBe(3);
    expect((await updateEventRsvp(slugs[0], { ...fields, editToken: hiddenToken })).ok).toBe(true);
    expect(await changeEventLifecycleRecord(ids[0], 3, "close-rsvps")).toBe(4);
    expect(await changeEventLifecycleRecord(ids[0], 4, "unpublish")).toBe(5);
    expect(await getPublishedEvent(slugs[0])).toBeNull();
    expect(await getPublishedEvent(aliases[0])).toBeNull();
    expect(await resolvePublicEventScope(slugs[0])).toBeNull();
    expect((await submitEventRsvp(slugs[0], submit)).ok).toBe(false);
    expect((await updateEventRsvp(slugs[0], { ...fields, editToken: hiddenToken })).ok).toBe(false);
    // Host management still resolves the retained snapshot, never mutable rules.
    const privateScope = (await resolveHostEventScope(slugs[0]))!;
    expect(privateScope.access).toBe("host"); expect(privateScope.rsvp.maxPartySize).toBe(4);
    expect((await hostScopeArgs(slugs[0]))[0]?.slug).toBe(slugs[0]);
    expect(await getRsvpSummary(privateScope)).toEqual(await getRsvpSummary(a));
    await expect(createEventGuest(ids[0], randomUUID(), initial, form({ guestName: "Added while private" }))).rejects.toThrow("saved=create");
    const hiddenPublication = (await getHostEventPublication(slugs[0]))!;
    expect(hiddenPublication.visibility).toBe("unpublished"); expect(hiddenPublication.rsvpsOpen).toBe(false);
    // Stale publish/reopen tabs cannot undo a newer unpublish decision.
    expect(await changeEventLifecycleRecord(ids[0], 3, "reopen-rsvps")).toBeNull();
    expect(await publishEventRecord(ids[0], { details: 1, artwork: 0, settings: 2, publication: 4 }, null)).toBeNull();
    expect(await getPublishedEvent(slugs[0])).toBeNull();
    expect(await publishEventRecord(ids[0], { details: 1, artwork: 0, settings: 2, publication: 5 }, null)).toBe(6);
    expect((await getPublishedEvent(slugs[0]))!.websiteUrl).toBe(event.websiteUrl);
    expect((await getPublishedEvent(slugs[0]))!.rsvpsOpen).toBe(false);
    expect((await listHostPublications()).find((p) => p.id === ids[0])?.hasUnpublishedChanges).toBe(false);
    expect((await getRsvpSummary(a)).totalResponses).toBe(3);
    expect(await changeEventLifecycleRecord(ids[0], 6, "reopen-rsvps")).toBe(7);
    expect((await updateEventRsvp(slugs[0], { ...fields, partySize: 1, editToken: hiddenToken })).ok).toBe(true);
    const clicks = await Promise.all([changeEventLifecycleRecord(ids[0], 7, "close-rsvps"), changeEventLifecycleRecord(ids[0], 7, "close-rsvps")]);
    expect(clicks.filter((value) => value === 8)).toHaveLength(1); expect(clicks.filter((value) => value === null)).toHaveLength(1);

    // Archive keeps both the published snapshot and unreviewed artwork/content.
    expect(await saveDraftArtworkRecord(ids[0], 0, { ...snapshot.artwork, header: { ...snapshot.artwork.header, focalX: 42 } })).toBe(1);
    const contentScope = (await resolvePublicEventScope(slugs[0]))!;
    expect(await createPlaylistSuggestion({ provider: "spotify", providerTrackId: "a".repeat(22), songTitle: "Synthetic song", artist: "Test artist", album: null, artworkUrl: null, externalUrl: `https://open.spotify.com/track/${"a".repeat(22)}`, explicit: false, suggestedBy: "Synthetic guest" }, contentScope)).toBe("added");
    await insertGuestQuestion({ question: "Synthetic private question?", guestName: "Synthetic guest", requestToken: randomUUID() }, contentScope);
    await insertHostUpdate(randomUUID(), { heading: null, message: "Synthetic host update." }, contentScope);
    expect(await savePoll(randomUUID(), { question: "Synthetic poll?", eyebrow: null, allowMultiple: false, showResults: true, showClosedResults: true, sortOrder: 0, options: [{ key: randomUUID(), text: "One" }, { key: randomUUID(), text: "Two" }] }, true, contentScope)).toBe(true);
    async function retainedData() {
      const hostScope = (await resolveHostEventScope(slugs[0]))!;
      return {
        guests: await listRsvps("all", hostScope), artwork: await getDraftArtwork(ids[0]),
        songs: await listPlaylistSuggestionsForAdmin(hostScope), questions: await listQuestionsForAdmin(hostScope),
        updates: await listHostUpdatesForAdmin(hostScope), polls: await listPollsForAdmin(hostScope),
        edit: await getRsvpForGuest(hashRsvpEditToken(hiddenToken), hostScope),
      };
    }
    const retainedBefore = await retainedData();
    expect(retainedBefore.songs).toHaveLength(1); expect(retainedBefore.questions).toHaveLength(1);
    expect(retainedBefore.updates).toHaveLength(1); expect(retainedBefore.polls).toHaveLength(1);
    expect(await changeEventLifecycleRecord(ids[0], 8, "reopen-rsvps")).toBe(9);
    const publishedBefore = (await getHostEventPublication(slugs[0]))!;
    const archiveClicks = await Promise.all([changeEventLifecycleRecord(ids[0], 9, "archive"), changeEventLifecycleRecord(ids[0], 9, "archive")]);
    expect(archiveClicks.filter((value) => value === 10)).toHaveLength(1); expect(archiveClicks.filter((value) => value === null)).toHaveLength(1);
    expect(await getHostEventPublication(slugs[0])).toMatchObject({ visibility: "archived", rsvpsOpen: false, revision: 10, snapshot: publishedBefore.snapshot, sourceRevisions: publishedBefore.sourceRevisions, publishedAt: publishedBefore.publishedAt });
    expect((await listHostPublications()).find((p) => p.id === ids[0])).toMatchObject({ visibility: "archived", hasUnpublishedChanges: true });
    expect(await getPublishedEvent(slugs[0])).toBeNull(); expect(await resolvePublicEventScope(slugs[0])).toBeNull();
    expect(await getPublishedEvent(aliases[0])).toBeNull(); expect(await resolvePublicEventScope(aliases[0])).toBeNull();
    state.authenticated = false;
    expect((await submitEventRsvp(slugs[0], { ...submit, submissionId: randomUUID() })).ok).toBe(false);
    expect((await updateEventRsvp(slugs[0], { ...fields, partySize: 1, editToken: hiddenToken })).ok).toBe(false);
    expect((await updateEventRsvp(aliases[0], { ...fields, partySize: 1, editToken: hiddenToken })).ok).toBe(false);
    await expect(saveRsvp({ ...fields, id: randomUUID(), eventSlug: slugs[0] }, hashRsvpEditToken("e".repeat(43)), a)).rejects.toThrow();
    expect(await updateRsvpForGuest(hashRsvpEditToken(hiddenToken), { ...fields, partySize: 1 }, a)).toBeNull();
    await expect(resolveHostEventScope(slugs[0])).rejects.toThrow("Host access required");
    state.authenticated = true;
    expect((await hostScopeArgs(slugs[0]))[0]?.access).toBe("host");
    expect(await retainedData()).toEqual(retainedBefore);
    expect(rsvpsToCsv((await retainedData()).guests)).toBe(rsvpsToCsv(retainedBefore.guests));
    // Even a current archived revision cannot reopen or republish without restore.
    for (const action of ["reopen-rsvps", "unpublish", "archive"] as const) expect(await changeEventLifecycleRecord(ids[0], 10, action)).toBeNull();
    expect(await publishEventRecord(ids[0], { details: 1, artwork: 1, settings: 2, publication: 10 }, null)).toBeNull();
    expect(await changeEventLifecycleRecord(ids[0], 9, "restore")).toBeNull();
    expect(await changeEventLifecycleRecord(ids[1], 1, "restore")).toBeNull();
    if (embedded) await embedded.exec(await readFile("db/migrations/016_event_archive.sql", "utf8"));
    else await sql(await readFile("db/migrations/016_event_archive.sql", "utf8"));
    expect(await getHostEventPublication(slugs[0])).toMatchObject({ visibility: "archived", rsvpsOpen: false, revision: 10 });
    await expect(query`UPDATE event_publications SET rsvps_open = true WHERE event_id = ${ids[0]}::uuid RETURNING revision`).rejects.toThrow();
    expect(await changeEventLifecycleRecord(ids[0], 10, "restore")).toBe(11);
    expect(await getHostEventPublication(slugs[0])).toMatchObject({ visibility: "unpublished", rsvpsOpen: false, revision: 11, snapshot: publishedBefore.snapshot, sourceRevisions: publishedBefore.sourceRevisions, publishedAt: publishedBefore.publishedAt });
    expect(await getPublishedEvent(slugs[0])).toBeNull(); expect(await resolvePublicEventScope(slugs[0])).toBeNull();
    expect(await getPublishedEvent(aliases[0])).toBeNull();
    expect(await retainedData()).toEqual(retainedBefore);
    expect(await publishEventRecord(ids[0], { details: 1, artwork: 1, settings: 2, publication: 11 }, null)).toBe(12);
    expect((await getPublishedEvent(slugs[0]))!.websiteUrl).toBe(event.websiteUrl);
    expect(await getPublishedEvent(aliases[0])).toEqual(await getPublishedEvent(slugs[0]));
    expect((await getPublishedEvent(slugs[0]))!.rsvpsOpen).toBe(false);
    expect(await changeEventLifecycleRecord(ids[0], 12, "reopen-rsvps")).toBe(13);
    expect((await updateEventRsvp(aliases[0], { ...fields, partySize: 1, editToken: hiddenToken })).ok).toBe(true);
    // A private/unpublished event can also be archived, without touching event A.
    expect(await changeEventLifecycleRecord(ids[1], 1, "unpublish")).toBe(2);
    expect(await changeEventLifecycleRecord(ids[1], 2, "archive")).toBe(3);
    expect(await changeEventLifecycleRecord(ids[1], 3, "restore")).toBe(4);
    expect(await getHostEventPublication(slugs[1])).toMatchObject({ visibility: "unpublished", rsvpsOpen: false });
    expect((await getRsvpSummary(b)).totalResponses).toBe(0);
    expect((await getHostEventPublication(slugs[0]))!.revision).toBe(13);
    // Published aliases (including NULL for existing events) are immutable.
    await expect(query`UPDATE event_publications SET public_alias = 'changed-link' WHERE event_id = ${ids[0]}::uuid RETURNING revision`).rejects.toThrow();
    await expect(query`UPDATE event_publications SET public_alias = 'changed-link' WHERE event_id = ${ids[1]}::uuid RETURNING revision`).rejects.toThrow();
    expect(await publishEventRecord(ids[0], { details: 1, artwork: 1, settings: 2, publication: 13 }, null, "changed-link")).toBeNull();

    // Two hosts can pass a read-only availability check, but only one can claim.
    for (const id of ids.slice(2)) {
      await saveEventDraftRecord(id, 0, { ...draft, title: "Synthetic alias collision" });
      await saveDraftSettingsRecord(id, 0, snapshot.settings);
      expect(await isEventAliasAvailable(id, aliases[2])).toBe(true);
    }
    const race = await Promise.allSettled(ids.slice(2).map((id) => publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null, aliases[2])));
    expect(race.filter((result) => result.status === "fulfilled" && result.value === 1)).toHaveLength(1);
    expect(race.filter((result) => result.status === "rejected" && String(result.reason).includes("link was just taken"))).toHaveLength(1);
    const winner = ids[2 + race.findIndex((result) => result.status === "fulfilled")], loser = ids[2 + race.findIndex((result) => result.status === "rejected")];
    expect(await getPublishedEvent(`event-${loser}`)).toBeNull();
    expect(await changeEventLifecycleRecord(winner, 1, "archive")).toBe(2);
    expect(await isEventAliasAvailable(loser, aliases[2])).toBe(false); // archive never releases a name
    expect(await getPublishedEvent(aliases[2])).toBeNull();
    for (const reserved of [...RESERVED_EVENT_ALIASES, "event-forged", "UPPERCASE", "party--time", "a".repeat(61)]) {
      await expect(query`INSERT INTO event_publications (event_id, slug, snapshot, source_revisions, public_alias)
        SELECT ${loser}::uuid, ${`event-${loser}`}, snapshot, source_revisions, ${reserved}
        FROM event_publications WHERE event_id = ${winner}::uuid RETURNING revision`).rejects.toThrow();
    }
    if (embedded) await embedded.exec(await readFile("db/migrations/017_event_public_aliases.sql", "utf8"));
    else await sql(await readFile("db/migrations/017_event_public_aliases.sql", "utf8"));
    expect((await getHostEventPublication(slugs[0]))!.publicAlias).toBe(aliases[0]);
    expect((await getHostEventPublication(slugs[1]))!.publicAlias).toBeNull();
    expect((await getHostEventPublication(`event-${winner}`))!.visibility).toBe("archived");
    expect(await getRsvpSummary(OYSTER_ROAST_SCOPE)).toEqual(legacyBefore);
  }, 30000);
});
