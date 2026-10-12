import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), save: vi.fn(), revalidate: vi.fn() }));
vi.mock("../lib/server/host-access", () => ({ isHostAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.get, saveDraftSettingsRecord: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveHubSectionVisibility } from "../app/admin/events/[id]/content/actions";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { eventId } from "./fixtures/publication";
const settings = { ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, capacity: 30, maxPartySize: 3, allowComments: false } };
const input = { id: eventId, revision: 2, section: "potluck", enabled: true };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.get.mockResolvedValue({ settings, revision: 2 }); mocks.save.mockResolvedValue(3);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("section visibility draft-only action", () => {
  it("requires a host session before reading or saving", async () => {
    mocks.auth.mockResolvedValue(false);
    expect(await saveHubSectionVisibility(input)).toMatchObject({ ok: false, message: expect.stringContaining("session") });
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["potluck", "polls", "updates", "questions"])("changes only %s, preserving other settings loaded server-side", async section => {
    expect(await saveHubSectionVisibility({ ...input, section })).toEqual({ ok: true, enabled: true, revision: 3 });
    expect(mocks.save).toHaveBeenCalledWith(eventId, 2, { ...settings, features: { ...settings.features, [section]: true } });
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/events"], [`/admin/events/${eventId}`, "layout"]]);
  });
  it("can turn a flag off without removing content or touching the publication", async () => {
    expect(await saveHubSectionVisibility({ ...input, enabled: false })).toEqual({ ok: true, enabled: false, revision: 3 });
    expect(mocks.save).toHaveBeenCalledWith(eventId, 2, settings);
  });
  it.each([null, [], {}, { ...input, section: "photos" }, { ...input, section: "weather" }, { ...input, section: "__proto__" }, { ...input, enabled: "true" }, { ...input, id: "bad" }, { ...input, revision: -1 }, { ...input, revision: "2" }, { ...input, settings: {} }, { ...input, publish: true }])("rejects invalid or over-broad input: %j", async value => {
    expect((await saveHubSectionVisibility(value)).ok).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([null, { settings, revision: 3 }])("rejects missing/unowned or stale settings before any write", async record => {
    mocks.get.mockResolvedValue(record);
    expect(await saveHubSectionVisibility(input)).toMatchObject({ ok: false, conflict: true });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects a concurrent write between the read and save", async () => {
    mocks.save.mockResolvedValue(null);
    expect(await saveHubSectionVisibility(input)).toMatchObject({ ok: false, conflict: true });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(["read", "save"])("never claims success or leaks database details after %s failure", async phase => {
    (phase === "read" ? mocks.get : mocks.save).mockRejectedValue(Error("postgresql://secret"));
    const result = await saveHubSectionVisibility(input);
    expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
