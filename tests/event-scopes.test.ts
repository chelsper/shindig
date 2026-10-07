import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), settings: vi.fn(), neon: vi.fn(), sql: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { draftEventSlug, eventPaths } from "../lib/event-routes";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { assertEventScope, eventScopeSlug, getHostDraftScope, OYSTER_ROAST_SCOPE, resolvePublicEventScope, type EventScope } from "../lib/server/event-scope";
import * as rsvps from "../lib/server/rsvps";
import * as playlist from "../lib/server/playlist";
import * as questions from "../lib/server/questions";
import * as updates from "../lib/server/updates";
import * as applause from "../lib/server/applause";
import * as polls from "../lib/server/polls";
import { validateRsvpSubmission } from "../lib/server/rsvp-validation";
import { pollInput, pollKey, pollOptions } from "./fixtures/polls";
const first = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const second = "7ac5edab-22aa-447d-8931-91132a16798a";
const token = "a".repeat(64);
const input = { guestName: "Test household", attending: true, partySize: 3, displayOnGuestList: true, comment: "Note" };
const track = { provider: "spotify", providerTrackId: "track", songTitle: "Song", artist: "Artist", album: null, artworkUrl: null, externalUrl: "https://open.spotify.com/track/track", explicit: null, suggestedBy: null };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://test@example.test/test");
  mocks.auth.mockResolvedValue(true); mocks.draft.mockImplementation(async (id) => ({ id }));
  mocks.settings.mockResolvedValue({ settings: { rsvp: { maxPartySize: 4, allowComments: false, guestListDefaultVisible: true }, features: { ...DEFAULT_DRAFT_SETTINGS.features, playlist: true, questions: true, polls: true, updates: true } }, revision: 1 });
  mocks.neon.mockReturnValue(mocks.sql); mocks.sql.mockResolvedValue([]);
});
async function scope(id = first) { const value = await getHostDraftScope(id); expect(value).not.toBeNull(); return value!; }

describe("event identity and server-resolved access", () => {
  it("makes distinct stable routes from event identity, not mutable titles", () => {
    expect(draftEventSlug(first.toUpperCase())).toBe(`event-${first}`);
    expect(eventPaths(draftEventSlug(first))).toEqual({ invitation: `/e/event-${first}`, hub: `/e/event-${first}/event` });
    expect(draftEventSlug(first)).not.toBe(draftEventSlug(second));
    expect(() => draftEventSlug("../admin")).toThrow(); expect(() => eventPaths("//evil.test")).toThrow();
  });
  it("resolves the legacy event while unpublished drafts and unknown slugs are indistinguishable", async () => {
    expect(await resolvePublicEventScope("oyster-roast-2026")).toBe(OYSTER_ROAST_SCOPE);
    for (const slug of [draftEventSlug(first), "private-party", "../admin", "", "OYSTER-ROAST-2026"]) expect(await resolvePublicEventScope(slug)).toBeNull();
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("requires the host session before looking up a private scope", async () => {
    mocks.auth.mockResolvedValue(false); await expect(getHostDraftScope(first)).rejects.toThrow("Host access");
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("does not authorize missing drafts or conceal storage failure", async () => {
    mocks.draft.mockResolvedValue(null); expect(await getHostDraftScope(first)).toBeNull();
    mocks.settings.mockRejectedValue(new Error("unavailable")); await expect(getHostDraftScope(first)).rejects.toThrow("unavailable");
  });
  it("rejects forged, copied and deserialized scope objects before connecting to storage", async () => {
    const real = await scope();
    for (const value of [{ slug: real.slug }, { ...real }, JSON.parse(JSON.stringify(real)), null]) {
      const forged = value as EventScope;
      expect(() => assertEventScope(forged)).toThrow(); await expect(rsvps.listRsvps("all", forged)).rejects.toThrow();
    }
    expect(mocks.neon).not.toHaveBeenCalled(); expect(Object.isFrozen(real)).toBe(true); expect(Object.isFrozen(real.features)).toBe(true);
  });
});

describe("scoped RSVP rules and token access", () => {
  it("refuses a caller's event slug when it differs from the resolved event", async () => {
    await expect(rsvps.saveRsvp({ id: second, eventSlug: "oyster-roast-2026", ...input }, token, await scope())).rejects.toThrow("Invalid RSVP event");
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(validateRsvpSubmission({ ...input, submissionId: second, eventSlug: draftEventSlug(first) }).success).toBe(false);
  });
  it("enforces the resolved event's party limit and strips disabled comments", async () => {
    const event = await scope();
    await expect(rsvps.updateRsvpForGuest(token, { ...input, partySize: 5 }, event)).rejects.toThrow("Invalid RSVP");
    expect(mocks.sql).not.toHaveBeenCalled();
    await rsvps.updateRsvpForGuest(token, input, event);
    expect(mocks.sql.mock.lastCall!.slice(1)).toEqual([event.slug, input.guestName, true, 3, true, null, event.slug, token, false]);
    expect(mocks.sql.mock.lastCall![0].join("?")).toContain("AND rsvps_open FOR SHARE");
  });
  it("normalizes declined party size and visibility even when forged values are supplied", async () => {
    await rsvps.updateRsvpForGuest(token, { ...input, attending: false, partySize: 19 }, await scope());
    expect(mocks.sql.mock.lastCall!.slice(2, 7)).toEqual([input.guestName, false, null, false, null]);
  });
  it("binds initial writes and duplicate retry lookups to the same resolved event", async () => {
    const event = await scope();
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: second, ...input, comment: null, editTokenHash: token }]);
    expect((await rsvps.saveRsvp({ id: second, eventSlug: event.slug, ...input }, token, event)).status).toBe("duplicate");
    expect(mocks.sql.mock.calls[0].slice(1)).toContain(event.slug);
    expect(mocks.sql.mock.calls[1][0].join("?")).toContain("AND event_slug = ?");
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual([second, event.slug]);
  });
  it("returns no match for an edit token not found within the event", async () => {
    const event = await scope(); expect(await rsvps.getRsvpForGuest(token, event)).toBeNull();
    expect(mocks.sql.mock.lastCall!.slice(1)).toEqual([event.slug, token]);
  });
  it("counts hidden guests within the event while projecting only opted-in names", async () => {
    const event = await scope();
    mocks.sql.mockResolvedValueOnce([{ totalGuestCount: 6 }]).mockResolvedValueOnce([{ guestName: "Visible", partySize: 2, comment: "private", id: second }]);
    expect(await rsvps.getPublicGuestList(event)).toEqual({ totalGuestCount: 6, guests: [{ guestName: "Visible", partySize: 2 }] });
    for (const call of mocks.sql.mock.calls) expect(call.slice(1)).toEqual([event.slug]);
    expect(mocks.sql.mock.calls[1][0].join("?")).toContain("AND display_on_guest_list = true");
  });
});

describe("all module data paths bind the server-resolved event", () => {
  const operations: Array<[string, (s: EventScope) => Promise<unknown>]> = [
    ["RSVP summary", (s) => rsvps.getRsvpSummary(s)], ["RSVP list", (s) => rsvps.listRsvps("all", s)],
    ["RSVP host lookup", (s) => rsvps.getRsvpForAdmin(second, s)], ["RSVP host update", (s) => rsvps.updateRsvpForAdmin(second, input, s)], ["RSVP delete", (s) => rsvps.deleteRsvpForAdmin(second, s)],
    ["public playlist", (s) => playlist.listPublicPlaylistSuggestions(s)], ["playlist add", (s) => playlist.createPlaylistSuggestion(track, s)], ["host playlist", (s) => playlist.listPlaylistSuggestionsForAdmin(s)], ["playlist delete", (s) => playlist.deletePlaylistSuggestion(second, s)],
    ["public questions", (s) => questions.listPublicQuestions(s)], ["question add", (s) => questions.insertGuestQuestion({ requestToken: second, question: "Question?", guestName: null }, s)], ["host questions", (s) => questions.listQuestionsForAdmin(s)], ["answer", (s) => questions.saveQuestionAnswer(second, { answer: "Answer", isPublished: true }, s)], ["delete question", (s) => questions.removeQuestion(second, s)],
    ["public updates", (s) => updates.listPublicHostUpdates(s)], ["host updates", (s) => updates.listHostUpdatesForAdmin(s)], ["add update", (s) => updates.insertHostUpdate(second, { heading: null, message: "Hi" }, s)], ["edit update", (s) => updates.updateHostUpdate(second, { heading: null, message: "Hi" }, s)], ["delete update", (s) => updates.removeHostUpdate(second, s)],
    ["applause choices", (s) => applause.listGuestApplause(token, s)], ["applause write", (s) => applause.setPlaylistApplause(pollKey, true, token, s)],
    ["public polls", (s) => polls.listPublicPolls(s)], ["poll choices", (s) => polls.listGuestPollStates(token, s)], ["poll vote", (s) => polls.setPollVote(pollKey, [pollOptions[0].key], token, s)], ["host polls", (s) => polls.listPollsForAdmin(s)], ["save poll", (s) => polls.savePoll(pollKey, pollInput, true, s)], ["poll status", (s) => polls.changePollStatus(pollKey, "CLOSED", s)],
  ];
  it.each(operations)("%s", async (_label, operation) => {
    const a = await scope(first), b = await scope(second);
    for (const event of [a, b]) {
      mocks.sql.mockClear(); await operation(event); expect(mocks.sql).toHaveBeenCalled();
      for (const call of mocks.sql.mock.calls) {
        expect(call.slice(1)).toContain(eventScopeSlug(event));
        expect(call.slice(1)).not.toContain(OYSTER_ROAST_SCOPE.slug);
        expect(call.slice(1)).not.toContain(event === a ? b.slug : a.slug);
      }
    }
  });
  it("namespaces question retry tokens without changing existing Oyster Roast hashes", async () => {
    const hashes: string[] = [];
    for (const event of [await scope(first), await scope(second), OYSTER_ROAST_SCOPE]) {
      await questions.insertGuestQuestion({ requestToken: second, question: "?", guestName: null }, event);
      hashes.push(mocks.sql.mock.lastCall!.at(-1));
    }
    expect(new Set(hashes).size).toBe(3); for (const hash of hashes) expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("skips disabled module reads and rejects guest writes before storage", async () => {
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_DRAFT_SETTINGS, features: Object.fromEntries(Object.keys(DEFAULT_DRAFT_SETTINGS.features).map((key) => [key, false])) }, revision: 1 });
    const event = await scope();
    expect(await rsvps.getPublicGuestList(event)).toEqual({ totalGuestCount: 0, guests: [] });
    for (const list of [playlist.listPublicPlaylistSuggestions, questions.listPublicQuestions, updates.listPublicHostUpdates, polls.listPublicPolls]) expect(await list(event)).toEqual([]);
    expect(await applause.listGuestApplause(token, event)).toEqual([]); expect(await polls.listGuestPollStates(token, event)).toEqual({});
    for (const attempt of [playlist.createPlaylistSuggestion(track, event), questions.insertGuestQuestion({ requestToken: second, question: "?", guestName: null }, event), applause.setPlaylistApplause(pollKey, true, token, event), polls.setPollVote(pollKey, [], token, event)]) await expect(attempt).rejects.toThrow("not available");
    expect(mocks.sql).not.toHaveBeenCalled(); expect(mocks.neon).not.toHaveBeenCalled();
  });
});
