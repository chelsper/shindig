import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), sql: vi.fn(), neon: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { getDraftSettings, saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue({ id }); mocks.neon.mockReturnValue(mocks.sql); mocks.sql.mockResolvedValue([]);
  vi.stubEnv("DATABASE_URL", "postgresql://unit-test");
});
afterEach(() => vi.unstubAllEnvs());

describe("private draft settings data layer", () => {
  it("requires host authentication before accessing the database", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(getDraftSettings(id)).rejects.toThrow("Host access");
    await expect(saveDraftSettingsRecord(id, 0, DEFAULT_DRAFT_SETTINGS)).rejects.toThrow("Host access");
    expect(mocks.neon).not.toHaveBeenCalled(); expect(mocks.draft).not.toHaveBeenCalled();
  });
  it("returns independent unsaved defaults only for existing drafts", async () => {
    const first = await getDraftSettings(id);
    expect(first).toEqual({ settings: DEFAULT_DRAFT_SETTINGS, revision: 0 });
    first!.settings.features.guestList = false;
    expect((await getDraftSettings(id))!.settings.features.guestList).toBe(true);
    mocks.draft.mockResolvedValue(null); mocks.sql.mockClear();
    expect(await getDraftSettings(id)).toBeNull(); expect(await saveDraftSettingsRecord(id, 0, DEFAULT_DRAFT_SETTINGS)).toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("validates stored data and returns only settings and revision", async () => {
    mocks.sql.mockResolvedValue([{ ...DEFAULT_DRAFT_SETTINGS.rsvp, features: DEFAULT_DRAFT_SETTINGS.features, revision: 1, secret: "not returned" }]);
    expect(await getDraftSettings(id)).toEqual({ settings: DEFAULT_DRAFT_SETTINGS, revision: 1 });
    mocks.sql.mockResolvedValue([{ ...DEFAULT_DRAFT_SETTINGS.rsvp, features: { ...DEFAULT_DRAFT_SETTINGS.features, photos: true }, revision: 1 }]);
    await expect(getDraftSettings(id)).rejects.toThrow("Invalid draft settings");
    mocks.sql.mockResolvedValue([{ ...DEFAULT_DRAFT_SETTINGS.rsvp, features: DEFAULT_DRAFT_SETTINGS.features, revision: 0 }]);
    await expect(getDraftSettings(id)).rejects.toThrow("Invalid draft settings");
  });
  it("binds inserts to the specified draft and rejects duplicate creation", async () => {
    mocks.sql.mockResolvedValueOnce([{ revision: 1 }]);
    expect(await saveDraftSettingsRecord(id, 0, DEFAULT_DRAFT_SETTINGS)).toBe(1);
    const [query, ...values] = mocks.sql.mock.calls[0];
    expect(query.join("?")).toContain("status = 'draft'"); expect(query.join("?")).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(query.join("?")).not.toMatch(/rsvps|invitation_settings|event_hub_settings|event_draft_artwork/);
    expect(values).toEqual([20, true, true, JSON.stringify(DEFAULT_DRAFT_SETTINGS.features), null, null, id]);
    expect(await saveDraftSettingsRecord(id, 0, DEFAULT_DRAFT_SETTINGS)).toBeNull();
  });
  it("updates timestamps with optimistic concurrency and draft scoping", async () => {
    mocks.sql.mockResolvedValueOnce([{ revision: 3 }]);
    expect(await saveDraftSettingsRecord(id, 2, DEFAULT_DRAFT_SETTINGS)).toBe(3);
    const query = mocks.sql.mock.calls[0][0].join("?");
    for (const text of ["revision = revision + 1", "updated_at = now()", "WHERE event_id = ?::uuid AND revision = ?", "status = 'draft'"]) expect(query).toContain(text);
    expect(await saveDraftSettingsRecord(id, 2, DEFAULT_DRAFT_SETTINGS)).toBeNull();
  });
  it("refuses invalid IDs, revisions, inputs, and missing database setup", async () => {
    expect(await getDraftSettings("bad")).toBeNull();
    for (const [draftId, revision, input] of [["bad", 0, DEFAULT_DRAFT_SETTINGS], [id, -1, DEFAULT_DRAFT_SETTINGS], [id, 0, {}]] as const) await expect(saveDraftSettingsRecord(draftId, revision, input)).rejects.toThrow("Invalid");
    expect(mocks.sql).not.toHaveBeenCalled();
    vi.stubEnv("DATABASE_URL", ""); await expect(getDraftSettings(id)).rejects.toThrow("not configured");
  });
  it("does not treat a schema/database failure as fresh defaults or success", async () => {
    mocks.sql.mockRejectedValue(new Error("database unavailable"));
    await expect(getDraftSettings(id)).rejects.toThrow("unavailable");
    await expect(saveDraftSettingsRecord(id, 0, DEFAULT_DRAFT_SETTINGS)).rejects.toThrow("unavailable");
  });
});
