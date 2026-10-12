import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ scope: vi.fn(), authorize: vi.fn(), rsvps: vi.fn(), query: vi.fn() }));
vi.mock("../lib/server/event-scope", () => ({ getHostDraftScope: mocks.scope, requireHostEventScope: mocks.authorize, eventScopeSlug: (scope: { slug: string }) => scope.slug }));
vi.mock("../lib/server/rsvps", () => ({ getRsvpSummary: mocks.rsvps }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.query }));
import { getHostingOverview } from "../lib/server/hosting-overview";
import { hosting } from "./fixtures/hosting-overview";
import { eventId, eventSlug } from "./fixtures/publication";
const scope = { slug: eventSlug };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/overview_test");
  mocks.scope.mockResolvedValue(scope); mocks.authorize.mockResolvedValue(undefined); mocks.rsvps.mockResolvedValue(hosting.rsvps);
  mocks.query.mockImplementation(async (parts: TemplateStringsArray) => {
    const sql = parts.join("");
    const result = sql.includes("potluck_items") ? hosting.potluck : sql.includes("event_questions") ? hosting.questions : sql.includes("playlist_suggestions") ? hosting.playlist : sql.includes("FROM polls") ? hosting.polls : hosting.updates;
    return [{ ...result, privateValue: "never forwarded" }];
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("owner-only aggregate reader", () => {
  it("checks current ownership and host scope before any aggregate query", async () => {
    mocks.scope.mockResolvedValue(null); expect(await getHostingOverview(eventId)).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.rsvps).not.toHaveBeenCalled();
    mocks.scope.mockResolvedValue(scope); mocks.authorize.mockRejectedValue(Error("Unauthorized"));
    await expect(getHostingOverview(eventId)).rejects.toThrow("Unauthorized"); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("parameterizes the event and returns only counts without caching results", async () => {
    const data = await getHostingOverview(eventId);
    expect(data).toEqual({ ...hosting, checkedAt: expect.any(Number) });
    expect(mocks.scope).toHaveBeenCalledWith(eventId); expect(mocks.rsvps).toHaveBeenCalledWith(scope);
    for (const [parts, ...values] of mocks.query.mock.calls) {
      const sql = parts.join("?"); expect(sql).toContain("event_slug=?"); expect(values).toEqual([eventSlug]);
      expect(sql).not.toMatch(/guest_name|edit_token|requester_hash|SELECT \*|INSERT|UPDATE|DELETE/);
    }
    expect(JSON.stringify(data)).not.toMatch(/never forwarded|privateValue/);
    mocks.rsvps.mockResolvedValue({ ...hosting.rsvps, totalPartySize: 25 });
    expect((await getHostingOverview(eventId))?.rsvps?.totalPartySize).toBe(25);
  });
  it("keeps optional-table failure separate from attendance and other modules", async () => {
    mocks.query.mockRejectedValueOnce(Error("private connection detail"));
    const data = await getHostingOverview(eventId);
    expect(data?.potluck).toBeNull(); expect(data?.rsvps).toEqual(hosting.rsvps); expect(data?.questions).toEqual(hosting.questions);
    expect(JSON.stringify(data)).not.toContain("private connection detail");
    mocks.rsvps.mockRejectedValue(Error("offline")); expect((await getHostingOverview(eventId))?.rsvps).toBeNull();
  });
  it.each([[], [{}], [{ total: -1 }], [{ total: "not a number" }], [{ total: 1.5 }]].map(rows => ({ rows })))("rejects missing/invalid totals rather than inventing zero: %j", ({ rows }) => {
    mocks.query.mockResolvedValue(rows);
    return getHostingOverview(eventId).then(data => { expect(data?.playlist).toBeNull(); });
  });
  it("does not issue optional queries when storage is missing", async () => {
    vi.stubEnv("DATABASE_URL", ""); const data = await getHostingOverview(eventId);
    expect(data?.questions).toBeNull(); expect(mocks.query).not.toHaveBeenCalled();
  });
});
