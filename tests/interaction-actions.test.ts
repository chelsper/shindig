import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), applause: vi.fn(), listApplause: vi.fn(), pollVote: vi.fn(), pollStates: vi.fn(), admin: vi.fn(), savePoll: vi.fn(), status: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("../lib/server/guest-token", () => ({ getGuestTokenHash: mocks.token }));
vi.mock("../lib/server/applause", () => ({ setPlaylistApplause: mocks.applause, listGuestApplause: mocks.listApplause }));
vi.mock("../lib/server/polls", () => ({ setPollVote: mocks.pollVote, listGuestPollStates: mocks.pollStates, savePoll: mocks.savePoll, changePollStatus: mocks.status }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.admin }));
import { applaudSong, loadGuestInteractions, voteInPoll } from "../app/event/interaction-actions";
import { saveHostPoll, setHostPollStatus } from "../app/admin/polls/actions";
import { OYSTER_ROAST_EVENT as event } from "../lib/oyster-roast-event";
import { pollInput, pollKey, pollOptions, pollResults } from "./fixtures/polls";

beforeEach(() => {
  vi.resetAllMocks();
  event.features.playlist = true; event.features.polls = true;
  mocks.token.mockResolvedValue("a".repeat(64)); mocks.admin.mockResolvedValue(true);
  mocks.applause.mockResolvedValue(4); mocks.listApplause.mockResolvedValue([pollKey]);
  mocks.pollVote.mockResolvedValue(true); mocks.pollStates.mockResolvedValue({ [pollKey]: { selected: [pollOptions[0].key], results: pollResults } });
  mocks.savePoll.mockResolvedValue(true); mocks.status.mockResolvedValue(true);
});

describe("anonymous interaction actions", () => {
  it("loads only this browser's selections without returning its token", async () => {
    const result = await loadGuestInteractions();
    expect(result.ok).toBe(true);
    expect(mocks.token).toHaveBeenCalledWith(true);
    expect(JSON.stringify(result)).not.toContain("a".repeat(64));
  });
  it("sets desired applause state, uses server counts, and refreshes public/admin lists", async () => {
    expect(await applaudSong(pollKey, true)).toEqual({ ok: true, data: { count: 4, active: true } });
    expect(mocks.applause).toHaveBeenCalledWith(pollKey, true, "a".repeat(64));
    expect(mocks.refresh).toHaveBeenCalledWith("/event");
    expect(mocks.refresh).toHaveBeenCalledWith("/admin/playlist");
    expect(await applaudSong(pollKey, false)).toEqual({ ok: true, data: { count: 4, active: false } });
  });
  it("rejects malformed applause and missing browser cookie without writes", async () => {
    expect((await applaudSong(pollKey, 99)).ok).toBe(false);
    expect((await applaudSong("bad", true)).ok).toBe(false);
    mocks.token.mockResolvedValue(null);
    expect((await applaudSong(pollKey, true)).ok).toBe(false);
    expect(mocks.applause).not.toHaveBeenCalled();
  });
  it("respects each feature flag independently", async () => {
    event.features.playlist = false;
    expect((await applaudSong(pollKey, true)).ok).toBe(false);
    expect((await voteInPoll(pollKey, [pollOptions[0].key])).ok).toBe(true);
    event.features.polls = false;
    expect((await voteInPoll(pollKey, [pollOptions[0].key])).ok).toBe(false);
    expect(await loadGuestInteractions()).toEqual({ ok: true, data: { applauded: [], polls: {} } });
  });
  it("atomically replaces a vote through the server operation and returns policy-filtered results", async () => {
    const result = await voteInPoll(pollKey, [pollOptions[0].key]);
    expect(mocks.pollVote).toHaveBeenCalledWith(pollKey, [pollOptions[0].key], "a".repeat(64));
    expect(result).toEqual({ ok: true, data: { selected: [pollOptions[0].key], results: pollResults } });
    mocks.pollStates.mockResolvedValue({ [pollKey]: { selected: [pollOptions[0].key], results: null } });
    expect(await voteInPoll(pollKey, [pollOptions[0].key])).toMatchObject({ ok: true, data: { results: null } });
  });
  it("does not claim success for a closed poll, bad selection, or DB failure", async () => {
    mocks.pollVote.mockResolvedValue(false);
    expect((await voteInPoll(pollKey, [pollOptions[0].key])).ok).toBe(false);
    expect((await voteInPoll(pollKey, [])).ok).toBe(false);
    mocks.applause.mockRejectedValue(new Error("database password detail"));
    const failure = await applaudSong(pollKey, true);
    expect(failure.ok).toBe(false);
    expect(JSON.stringify(failure)).not.toContain("password");
  });
});

describe("host poll actions", () => {
  it("protects every mutation with the existing server-verified host session", async () => {
    mocks.admin.mockResolvedValue(false);
    expect((await saveHostPoll(pollKey, pollInput, true)).ok).toBe(false);
    for (const status of ["OPEN", "CLOSED", "ARCHIVED", "DELETE_DRAFT"]) expect((await setHostPollStatus(pollKey, status, true)).ok).toBe(false);
    expect(mocks.savePoll).not.toHaveBeenCalled(); expect(mocks.status).not.toHaveBeenCalled();
  });
  it("validates creation and editing and keeps management available when guest polls are disabled", async () => {
    event.features.polls = false;
    expect((await saveHostPoll(pollKey, pollInput, true)).ok).toBe(true);
    expect(mocks.savePoll).toHaveBeenCalledWith(pollKey, pollInput, true);
    expect((await saveHostPoll(pollKey, { ...pollInput, question: "Changed question" }, false)).ok).toBe(true);
    expect((await saveHostPoll(pollKey, { ...pollInput, question: "" }, false)).ok).toBe(false);
  });
  it("supports opening, closing, reopening, and archival; rejects fabricated status", async () => {
    for (const status of ["OPEN", "CLOSED", "ARCHIVED", "OPEN"]) expect((await setHostPollStatus(pollKey, status)).ok).toBe(true);
    expect((await setHostPollStatus(pollKey, "DRAFT")).ok).toBe(false);
  });
  it("requires explicit deletion confirmation and respects database history guards", async () => {
    expect((await setHostPollStatus(pollKey, "DELETE_DRAFT")).ok).toBe(false);
    expect(mocks.status).not.toHaveBeenCalled();
    expect((await setHostPollStatus(pollKey, "DELETE_DRAFT", true)).ok).toBe(true);
    mocks.status.mockResolvedValue(false);
    expect((await setHostPollStatus(pollKey, "DELETE_DRAFT", true)).ok).toBe(false);
    mocks.savePoll.mockResolvedValue(false);
    expect((await saveHostPoll(pollKey, pollInput, false)).ok).toBe(false);
  });
});
