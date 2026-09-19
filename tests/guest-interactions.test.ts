import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cookies: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
import { getGuestTokenHash, guestTokenHash, GUEST_COOKIE } from "../lib/server/guest-token";
import { validatePoll, validatePollVote } from "../lib/server/poll-validation";
import { compactGuestName, guestListPreview } from "../lib/guest-list-preview";
import { sortPlaylist } from "../lib/playlist";
import { pollPercentage } from "../lib/polls";
import { pollInput, pollKey, pollOptions } from "./fixtures/polls";
import { legacy } from "./fixtures/music";

beforeEach(() => { vi.resetAllMocks(); mocks.cookies.mockResolvedValue({ get: mocks.get, set: mocks.set }); });

describe("shared anonymous browser marker", () => {
  it("creates 256 random bits in an HTTP-only cookie and returns only a hash", async () => {
    const first = await getGuestTokenHash(true);
    const [name, raw, options] = mocks.set.mock.calls[0];
    expect(name).toBe(GUEST_COOKIE);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(guestTokenHash(raw));
    expect(first).not.toBe(raw);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
    await getGuestTokenHash(true);
    expect(mocks.set.mock.calls[1][1]).not.toBe(raw);
  });
  it("reuses the same browser cookie across features and page visits", async () => {
    mocks.get.mockReturnValue({ value: "a".repeat(64) });
    const first = await getGuestTokenHash(true);
    expect(await getGuestTokenHash()).toBe(first);
    expect(await getGuestTokenHash(true)).toBe(first);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not mint a new identity while attempting to vote without cookies", async () => {
    expect(await getGuestTokenHash()).toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "not-a-token", "A".repeat(64), "a".repeat(63), "a".repeat(65), { value: "a".repeat(64) }])("rejects malformed tokens: %s", (raw) => { expect(guestTokenHash(raw)).toBeNull(); });
});

describe("compact public guest preview", () => {
  it("previews at most four public names and uses more only for more visible entries", () => {
    expect(guestListPreview(["Chelsea Santoro", "Damon Santoro", "Erica Jones", "Gretchen Jones", "Sarah & Mike"])).toEqual({ names: ["Chelsea", "Damon", "Erica", "Gretchen"], more: true });
    expect(guestListPreview(["Chelsea", "Damon"])).toEqual({ names: ["Chelsea", "Damon"], more: false });
    expect(guestListPreview([])).toEqual({ names: [], more: false });
  });
  it.each(["Chelsea & Damon", "Sarah and Mike", "The Smiths", "Jones Family", "Mary Jane Smith"])("does not guess a first name for %s", (name) => { expect(compactGuestName(name)).toBe(name); });
});

describe("playlist sorting", () => {
  const songs = [{ ...legacy, key: "b", applauseCount: 1, newestRank: 0 }, { ...legacy, key: "a", applauseCount: 7, newestRank: 1 }, { ...legacy, key: "c", applauseCount: 7, newestRank: 2 }];
  it("sorts popular counts first with stable newest ties", () => { expect(sortPlaylist(songs, "popular").map((s) => s.key)).toEqual(["a", "c", "b"]); });
  it("sorts newest independently of applause without mutating the input", () => { expect(sortPlaylist(songs, "newest").map((s) => s.key)).toEqual(["b", "a", "c"]); expect(songs[0].key).toBe("b"); });
});

describe("poll validation and percentages", () => {
  it("trims fields and ignores client-controlled status and totals", () => {
    expect(validatePoll({ ...pollInput, question: "  Best   oyster? ", eyebrow: " ", status: "OPEN", responses: 100 })).toMatchObject({ ok: true, data: { question: "Best oyster?", eyebrow: null } });
    expect(validatePoll(pollInput)).toEqual({ ok: true, data: pollInput });
  });
  it.each([{ question: " " }, { question: "x".repeat(241) }, { eyebrow: "x".repeat(61) }, { allowMultiple: "true" }, { showResults: 1 }, { showClosedResults: null }, { sortOrder: -1 }, { sortOrder: 1.5 }, { options: [] }, { options: [pollOptions[0]] }, { options: [pollOptions[0], pollOptions[0]] }, { options: [{ ...pollOptions[0], text: "Raw" }, { ...pollOptions[1], text: " raw " }] }, { options: [{ ...pollOptions[0], text: "x".repeat(101) }, pollOptions[1]] }])("rejects invalid host input %j", (overrides) => { expect(validatePoll({ ...pollInput, ...overrides }).ok).toBe(false); });
  it("validates a bounded unique option set but leaves poll membership/rules to the locked DB operation", () => {
    expect(validatePollVote(pollKey, [pollOptions[0].key])).toEqual({ ok: true, data: { key: pollKey, options: [pollOptions[0].key] } });
    expect(validatePollVote(pollKey, []).ok).toBe(false);
    expect(validatePollVote(pollKey, [pollOptions[0].key, pollOptions[0].key]).ok).toBe(false);
    expect(validatePollVote("not-id", [pollOptions[0].key]).ok).toBe(false);
    expect(validatePollVote(pollKey, ["bad-option"]).ok).toBe(false);
  });
  it("uses respondents, not total selections, as the denominator", () => {
    expect(pollPercentage(14, 30)).toBe(47);
    expect(pollPercentage(8, 30)).toBe(27);
    expect(pollPercentage(1, 1)).toBe(100);
    expect(pollPercentage(0, 0)).toBe(0);
    expect(pollPercentage(2, 3) + pollPercentage(2, 3)).toBe(134);
  });
});
