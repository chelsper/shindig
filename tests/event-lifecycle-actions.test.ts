import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ change: vi.fn(), publish: vi.fn(), refresh: vi.fn(), publication: vi.fn() }));
vi.mock("../lib/server/event-publications", () => ({ changeEventLifecycleRecord: mocks.change, publishEventRecord: mocks.publish, getHostEventPublication: mocks.publication }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { changeEventLifecycle } from "../app/admin/events/[id]/publish/actions";
import { eventId, eventSlug } from "./fixtures/publication";
beforeEach(() => { vi.resetAllMocks(); mocks.change.mockResolvedValue(2); });
describe("confirmed lifecycle actions", () => {
  it.each(["close-rsvps", "reopen-rsvps", "unpublish", "archive", "restore"] as const)("requires explicit confirmation for %s", async (action) => {
    expect((await changeEventLifecycle(eventId, 1, action, false)).ok).toBe(false);
    expect(mocks.change).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("rejects arbitrary operations without touching storage", async () => {
    expect((await changeEventLifecycle(eventId, 1, "publish" as never, true)).ok).toBe(false);
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it.each(["unpublish", "archive", "restore"] as const)("refreshes all routes for %s within this event, never the legacy event", async (action) => {
    expect((await changeEventLifecycle(eventId, 1, action, true)).ok).toBe(true);
    expect(mocks.change).toHaveBeenCalledWith(eventId, 1, action);
    expect(mocks.refresh.mock.calls).toEqual([[`/e/${eventSlug}`, "layout"], [`/e/${eventSlug}/event`], [`/admin/events/${eventId}`, "layout"], ["/admin/events"]]);
  });
  it("does not show false success or refresh after a stale-tab conflict", async () => {
    mocks.change.mockResolvedValue(null);
    expect(await changeEventLifecycle(eventId, 1, "unpublish", true)).toMatchObject({ ok: false, message: expect.stringContaining("Refresh") });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("hides database details and asks for a status check after an uncertain failure", async () => {
    mocks.change.mockRejectedValue(new Error("postgresql://secret"));
    const result = await changeEventLifecycle(eventId, 1, "unpublish", true);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret"); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("invalidates both friendly and original paths after an archive", async () => {
    mocks.publication.mockResolvedValue({ publicAlias: "garden-supper" });
    expect((await changeEventLifecycle(eventId, 1, "archive", true)).ok).toBe(true);
    expect(mocks.refresh.mock.calls).toEqual([[`/e/${eventSlug}`, "layout"], [`/e/${eventSlug}/event`], ["/e/garden-supper", "layout"], ["/e/garden-supper/event"], [`/admin/events/${eventId}`, "layout"], ["/admin/events"]]);
  });
});
