import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ event: vi.fn(), query: vi.fn() }));
vi.mock("../lib/server/host-hub-content", () => ({ getHostHubContentEvent: mocks.event }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.query }));
import { getHostHubPreview } from "../lib/server/host-hub-preview";
import { draft, publication } from "./fixtures/publication";
import { previewSettings } from "./fixtures/hub-preview";
const event = { slug: `event-${draft.id}`, settings: { settings: previewSettings }, publication: null };
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks(); mocks.event.mockResolvedValue(event); mocks.query.mockResolvedValue([]);
  vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/preview_test");
});
describe("owner-only Hub preview reader", () => {
  it("checks ownership before any content query, with no legacy fallback", async () => {
    mocks.event.mockResolvedValue(null); expect(await getHostHubPreview(draft.id)).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.event).toHaveBeenCalledWith(draft.id);
    mocks.event.mockRejectedValue(Error("Host access required")); await expect(getHostHubPreview(draft.id)).rejects.toThrow("Host access");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("reads only enabled sections, scopes every query, and selects no private identity fields", async () => {
    await getHostHubPreview(draft.id);
    expect(mocks.query).toHaveBeenCalledTimes(4);
    for (const [parts, ...params] of mocks.query.mock.calls) {
      const sql = parts.join("?");
      expect(sql).not.toMatch(/SELECT \*|guest_name|requester_hash|edit_token|submission_hash/);
      expect(sql).toContain("event_slug=?"); expect(params).toEqual([event.slug]);
    }
    mocks.query.mockClear();
    mocks.event.mockResolvedValue({ ...event, settings: { settings: { ...previewSettings, features: Object.fromEntries(Object.keys(previewSettings.features).map(key => [key, false])) } } });
    const data = await getHostHubPreview(draft.id);
    expect(mocks.query).not.toHaveBeenCalled(); expect(data?.potluck.state).toBe("disabled");
  });
  it("contains one section's failure and labels live content by publication, not draft flags", async () => {
    mocks.event.mockResolvedValue({ ...event, publication: { ...publication, snapshot: { ...publication.snapshot, settings: { ...previewSettings, features: { ...previewSettings.features, potluck: false } } } } });
    mocks.query.mockImplementation(async (parts: TemplateStringsArray) => { if (parts.join("").includes("potluck_items")) throw Error("secret"); return []; });
    const data = await getHostHubPreview(draft.id);
    expect(data?.potluck).toEqual({ state: "unavailable", live: false, items: [] });
    expect(data?.updates).toEqual({ state: "ready", live: true, items: [] });
    expect(JSON.stringify(data)).not.toContain("secret");
    mocks.event.mockResolvedValue({ ...event, publication: { ...publication, visibility: "unpublished" } });
    expect((await getHostHubPreview(draft.id))?.updates.live).toBe(false);
  });
  it("handles missing storage as unavailable, without making provider requests", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await getHostHubPreview(draft.id))?.updates.state).toBe("unavailable");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
