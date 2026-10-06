import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), sql: vi.fn(), neon: vi.fn(), head: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
import { getDraftArtwork, saveDraftArtworkRecord } from "../lib/server/event-draft-artwork";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const path = `event-drafts/${id}/invitation/30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6.png`;
const settings = { ...EMPTY_DRAFT_ARTWORK, invitation: { path, alt: "A gathering" } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue({ id }); mocks.neon.mockReturnValue(mocks.sql); mocks.sql.mockResolvedValue([]);
  vi.stubEnv("DATABASE_URL", "postgresql://unit-test"); vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", "private-test-token");
  mocks.head.mockResolvedValue({ pathname: path, url: `https://test.private.blob.vercel-storage.com/${path}`, size: 1024, contentType: "image/png" });
});
afterEach(() => vi.unstubAllEnvs());
describe("private draft artwork storage", () => {
  it("requires host authentication before every data operation", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(getDraftArtwork(id)).rejects.toThrow("Host access");
    await expect(saveDraftArtworkRecord(id, 0, settings)).rejects.toThrow("Host access");
    expect(mocks.neon).not.toHaveBeenCalled(); expect(mocks.head).not.toHaveBeenCalled();
  });
  it("returns empty settings only for an existing draft, never an invented event", async () => {
    expect(await getDraftArtwork(id)).toEqual({ settings: EMPTY_DRAFT_ARTWORK, revision: 0 });
    mocks.draft.mockResolvedValue(null); mocks.sql.mockClear();
    expect(await getDraftArtwork(id)).toBeNull(); expect(await saveDraftArtworkRecord(id, 0, settings)).toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("validates stored records and returns only artwork settings/revision", async () => {
    mocks.sql.mockResolvedValue([{ settings, revision: 1, privateExtra: "excluded" }]);
    expect(await getDraftArtwork(id)).toEqual({ settings, revision: 1 });
    mocks.sql.mockResolvedValue([{ settings: {}, revision: 1 }]);
    await expect(getDraftArtwork(id)).rejects.toThrow("Invalid draft artwork");
  });
  it("verifies private blob metadata before inserting bound draft-only settings", async () => {
    mocks.sql.mockResolvedValue([{ revision: 1 }]);
    expect(await saveDraftArtworkRecord(id, 0, settings)).toBe(1);
    expect(mocks.head).toHaveBeenCalledWith(path, { token: "private-test-token" });
    const [query, ...values] = mocks.sql.mock.calls[0];
    expect(query.join("?")).toContain("status = 'draft'"); expect(query.join("?")).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(query.join("?")).not.toMatch(/rsvps|event_hub_settings|invitation_settings/);
    expect(values).toEqual([JSON.stringify(settings), id]);
  });
  it("rejects stale or duplicate saves without changing another record", async () => {
    expect(await saveDraftArtworkRecord(id, 0, settings)).toBeNull();
    expect(await saveDraftArtworkRecord(id, 1, settings)).toBeNull();
    const sql = mocks.sql.mock.calls[1][0].join("?");
    expect(sql).toContain("AND revision = ?"); expect(sql).toContain("updated_at = now()"); expect(sql).toContain("status = 'draft'");
  });
  it.each([{ url: "https://test.public.blob.vercel-storage.com/image.png" }, { size: 5000000 }, { contentType: "image/svg+xml" }, { pathname: "different/path.png" }])("rejects unverified image metadata %j", async (patch) => {
    mocks.head.mockResolvedValue({ pathname: path, url: `https://test.private.blob.vercel-storage.com/${path}`, size: 1024, contentType: "image/png", ...patch });
    await expect(saveDraftArtworkRecord(id, 0, settings)).rejects.toThrow("Invalid private image"); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("allows clearing saved artwork without storage access or deleting files", async () => {
    vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", ""); mocks.sql.mockResolvedValue([{ revision: 2 }]);
    expect(await saveDraftArtworkRecord(id, 1, EMPTY_DRAFT_ARTWORK)).toBe(2); expect(mocks.head).not.toHaveBeenCalled();
  });
  it("does not bypass input validation or missing storage", async () => {
    await expect(saveDraftArtworkRecord(id, -1, settings)).rejects.toThrow("Invalid");
    await expect(saveDraftArtworkRecord(id, 0, {})).rejects.toThrow("Invalid");
    vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", "");
    await expect(saveDraftArtworkRecord(id, 0, settings)).rejects.toThrow("not configured"); expect(mocks.sql).not.toHaveBeenCalled();
  });
});
