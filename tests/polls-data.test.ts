import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ neon: vi.fn(), sql: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { listPublicPolls, listGuestPollStates, listPollsForAdmin, setPollVote, savePoll, changePollStatus } from "../lib/server/polls";
import { listGuestApplause, setPlaylistApplause } from "../lib/server/applause";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { adminPoll, pollInput, pollKey, pollOptions, pollResults, publicPoll } from "./fixtures/polls";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
  mocks.neon.mockReturnValue(mocks.sql);
});
const hash = "a".repeat(64);
const privateFields = { id: "internal", voter_token_hash: hash, created_at: "private", guest_name: "private name" };
const query = () => mocks.sql.mock.calls[0][0].join("?");

describe("public poll and applause projections", () => {
  it("returns safe metadata only; SQL excludes drafts/archives and suppresses unearned open results", async () => {
    mocks.sql.mockResolvedValue([{ ...publicPoll, ...privateFields }]);
    await expect(listPublicPolls()).resolves.toEqual([publicPoll]);
    expect(query()).toContain("p.event_slug = ?");
    expect(query()).toContain("p.status = 'OPEN' OR (p.status = 'CLOSED' AND p.show_closed_results)");
    expect(query()).toContain("CASE WHEN p.status = 'CLOSED' AND p.show_closed_results");
    expect(query()).toContain("ELSE NULL END AS results");
    expect(mocks.sql.mock.calls[0][1]).toBe(OYSTER_ROAST_EVENT.slug);
  });
  it("returns explicitly visible closed final aggregates without voter information", async () => {
    const closed = { ...publicPoll, status: "CLOSED", results: pollResults };
    mocks.sql.mockResolvedValue([{ ...closed, ...privateFields }]);
    await expect(listPublicPolls()).resolves.toEqual([closed]);
  });
  it("skips the public query when disabled without removing admin access", async () => {
    const previous = OYSTER_ROAST_EVENT.features.polls;
    OYSTER_ROAST_EVENT.features.polls = false;
    try {
      await expect(listPublicPolls()).resolves.toEqual([]);
      expect(mocks.sql).not.toHaveBeenCalled();
      mocks.sql.mockResolvedValue([{ ...adminPoll, ...privateFields }]);
      await expect(listPollsForAdmin()).resolves.toEqual([adminPoll]);
    } finally { OYSTER_ROAST_EVENT.features.polls = previous; }
  });
  it("loads only this browser's choices and enforces visibility in SQL", async () => {
    mocks.sql.mockResolvedValue([{ key: pollKey, selected: [pollOptions[0].key], results: pollResults, ...privateFields }]);
    await expect(listGuestPollStates(hash)).resolves.toEqual({ [pollKey]: { selected: [pollOptions[0].key], results: pollResults } });
    expect(query()).toContain("p.status = 'OPEN' AND p.show_results");
    expect(query()).toContain("AND EXISTS (SELECT 1 FROM poll_votes v WHERE v.poll_id = p.id AND v.voter_token_hash = ?)");
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([hash, OYSTER_ROAST_EVENT.slug, hash]);
  });
  it("preserves NULL hidden results rather than fabricating zero totals", async () => {
    mocks.sql.mockResolvedValue([{ key: pollKey, selected: [pollOptions[0].key], results: null }]);
    expect((await listGuestPollStates(hash))[pollKey].results).toBeNull();
  });
  it("returns only this browser's public song locators, never its hash or internal IDs", async () => {
    mocks.sql.mockResolvedValue([{ key: pollKey, ...privateFields }]);
    await expect(listGuestApplause(hash)).resolves.toEqual([pollKey]);
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([OYSTER_ROAST_EVENT.slug, hash]);
  });
  it("uses event-scoped transactional functions, not client totals or separate delete/insert requests", async () => {
    mocks.sql.mockResolvedValue([{ saved: true, count: 3 }]);
    await expect(setPlaylistApplause(pollKey, true, hash)).resolves.toBe(3);
    expect(query()).toContain("shindig_set_applause");
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([OYSTER_ROAST_EVENT.slug, pollKey, hash, true]);
    await expect(setPollVote(pollKey, [pollOptions[0].key], hash)).resolves.toBe(true);
    expect(mocks.sql.mock.calls[1][0].join("?")).toContain("shindig_set_poll_vote");
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual([OYSTER_ROAST_EVENT.slug, pollKey, [pollOptions[0].key], hash]);
  });
  it("propagates missing records/closed polls and database failures without false success", async () => {
    mocks.sql.mockResolvedValueOnce([{ count: null }]).mockResolvedValueOnce([{ saved: false }]).mockRejectedValueOnce(new Error("offline"));
    await expect(setPlaylistApplause(pollKey, true, hash)).resolves.toBeNull();
    await expect(setPollVote(pollKey, [pollOptions[0].key], hash)).resolves.toBe(false);
    await expect(listPublicPolls()).rejects.toThrow("offline");
  });
  it("sends host changes through locked event-scoped functions with parameterized text", async () => {
    mocks.sql.mockResolvedValue([{ saved: true }]);
    await expect(savePoll(pollKey, pollInput, true)).resolves.toBe(true);
    expect(query()).toContain("shindig_save_poll");
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([OYSTER_ROAST_EVENT.slug, pollKey, pollInput.question, pollInput.eyebrow, false, true, true, 0, JSON.stringify(pollOptions), true]);
    await expect(changePollStatus(pollKey, "ARCHIVED")).resolves.toBe(true);
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual([OYSTER_ROAST_EVENT.slug, pollKey, "ARCHIVED"]);
  });
});
