import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sql: vi.fn(), neon: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { getEventDraft, listEventDrafts, saveEventDraftRecord } from "../lib/server/event-drafts";
import { EMPTY_EVENT_DRAFT } from "../lib/event-drafts";
const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const fields = { ...EMPTY_EVENT_DRAFT, title: "Birthday" };
const row = { ...fields, id, status: "draft", revision: 1, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://local-test"); mocks.auth.mockResolvedValue(true); mocks.neon.mockReturnValue(mocks.sql); });
afterEach(() => vi.unstubAllEnvs());

describe("host-only draft storage", () => {
  it("rejects every read/write without a verified admin session, before connecting", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(listEventDrafts()).rejects.toThrow("Host access");
    await expect(getEventDraft(id)).rejects.toThrow("Host access");
    await expect(saveEventDraftRecord(id, 0, fields)).rejects.toThrow("Host access");
    expect(mocks.neon).not.toHaveBeenCalled(); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("fails honestly without a configured database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(saveEventDraftRecord(id, 0, fields)).rejects.toThrow("not configured");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("lists only draft summaries, newest updated first, never guest data or descriptions", async () => {
    mocks.sql.mockResolvedValue([{ ...row, secret: "not returned" }]);
    const result = await listEventDrafts();
    expect(result).toEqual([{ id, title: fields.title, startsAtUtc: null, timeZone: fields.timeZone, cityLabel: "", updatedAt: "2026-10-06T12:00:00.000Z" }]);
    const sql = mocks.sql.mock.calls[0][0].join("?");
    expect(sql).toContain("WHERE status = 'draft' ORDER BY updated_at DESC, id");
    expect(sql).not.toMatch(/description|host_name|rsvps|invitation_settings|SELECT \*/);
  });
  it("loads only the requested private draft and normalizes timestamps", async () => {
    mocks.sql.mockResolvedValue([{ ...row, createdAt: new Date(row.createdAt), privateExtra: "ignored" }]);
    expect(await getEventDraft(id)).toEqual({ ...row, createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z" });
    const [query, ...values] = mocks.sql.mock.calls[0];
    expect(query.join("?")).toContain("WHERE id = ?::uuid AND status = 'draft'"); expect(values).toEqual([id]);
  });
  it("handles invalid/missing IDs without inventing a record", async () => {
    expect(await getEventDraft("not-a-uuid")).toBeNull(); expect(mocks.sql).not.toHaveBeenCalled();
    mocks.sql.mockResolvedValue([]); expect(await getEventDraft(id)).toBeNull();
  });
  it("inserts a draft with bound values and an atomic stable-ID conflict guard", async () => {
    mocks.sql.mockResolvedValue([{ id, revision: 1 }]);
    expect(await saveEventDraftRecord(id, 0, fields)).toEqual({ id, revision: 1 });
    const [query, ...values] = mocks.sql.mock.calls[0];
    expect(query.join("?")).toContain("ON CONFLICT (id) DO NOTHING");
    expect(query.join("?")).toContain("'draft'");
    expect(values).toEqual([id, "Birthday", "", "", "", "", "", "America/New_York", null, null]);
    expect(query.join("?")).not.toMatch(/rsvps|invitation_settings|published/);
  });
  it("acknowledges duplicate creation only when all saved fields match", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    expect(await saveEventDraftRecord(id, 0, fields)).toEqual({ id, revision: 1 });
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...row, title: "Other content" }]);
    expect(await saveEventDraftRecord(id, 0, fields)).toBeNull();
  });
  it("updates only the expected draft revision and timestamp, not any published event", async () => {
    mocks.sql.mockResolvedValue([{ id, revision: 2 }]);
    expect(await saveEventDraftRecord(id, 1, fields)).toEqual({ id, revision: 2 });
    const [query, ...values] = mocks.sql.mock.calls[0];
    expect(query.join("?")).toContain("revision = revision + 1, updated_at = now()");
    expect(query.join("?")).toContain("WHERE id = ?::uuid AND status = 'draft' AND revision = ?");
    expect(values.slice(-2)).toEqual([id, 1]);
    mocks.sql.mockResolvedValue([]); expect(await saveEventDraftRecord(id, 1, fields)).toBeNull();
  });
  it("validates again at the storage boundary", async () => {
    await expect(saveEventDraftRecord("invalid", 0, fields)).rejects.toThrow("Invalid");
    await expect(saveEventDraftRecord(id, -1, fields)).rejects.toThrow("Invalid");
    await expect(saveEventDraftRecord(id, 0, { ...fields, title: "" })).rejects.toThrow("Invalid");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
