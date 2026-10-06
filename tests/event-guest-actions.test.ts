import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), pub: vi.fn(), config: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-publications", () => ({ getEventPublication: mocks.pub, getPublishedEvent: mocks.config }));
vi.mock("../lib/server/rsvps", () => ({ createRsvpForAdmin: mocks.create, updateRsvpForAdmin: mocks.update, deleteRsvpForAdmin: mocks.remove }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { createEventGuest, updateEventGuest, deleteEventGuest } from "../app/admin/events/[id]/guests/actions";
import { eventId, otherEventId, eventSlug, publication, snapshot } from "./fixtures/publication";
const initial = { error: null };
const form = (values: Record<string, string | undefined> = {}) => {
  const result = new FormData();
  for (const [key, value] of Object.entries({ guestName: "  Test Household  ", attending: "true", partySize: "3", displayOnGuestList: "on", comment: "  Private note  ", ...values })) if (value !== undefined) result.set(key, value);
  return result;
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.pub.mockResolvedValue(publication); mocks.config.mockResolvedValue({ title: "Garden Supper" });
  mocks.update.mockResolvedValue(true); mocks.remove.mockResolvedValue(true);
  mocks.redirect.mockImplementation((url) => { throw new Error(`REDIRECT:${url}`); });
});
describe("new-event host guest management", () => {
  it.each([createEventGuest, updateEventGuest, deleteEventGuest])("authenticates before any event or guest lookup", async (action) => {
    mocks.auth.mockResolvedValue(false);
    expect((await action(eventId, otherEventId, initial, form({ confirm: "delete" }))).error).toBeTruthy();
    for (const fn of [mocks.pub, mocks.config, mocks.create, mocks.update, mocks.remove, mocks.redirect]) expect(fn).not.toHaveBeenCalled();
  });
  it.each(["invalid", "oyster-roast-2026", "", "../admin"])("rejects an invalid event locator %s", async (id) => {
    expect((await createEventGuest(id, otherEventId, initial, form())).error).toBeTruthy();
    expect(mocks.pub).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not allow an unpublished event or fall back to Jasper Shucks", async () => {
    mocks.pub.mockResolvedValue(null); mocks.config.mockResolvedValue(null);
    expect((await createEventGuest(eventId, otherEventId, initial, form())).error).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("creates with a stable request ID, published rules, and only scoped refresh/redirect paths", async () => {
    await expect(createEventGuest(eventId, otherEventId, initial, form({ eventSlug: "oyster-roast-2026" }))).rejects.toThrow(`REDIRECT:/admin/events/${eventId}/guests?saved=create`);
    expect(mocks.create).toHaveBeenCalledWith(otherEventId, { guestName: "Test Household", attending: true, partySize: 3, displayOnGuestList: true, comment: "Private note" }, expect.objectContaining({ slug: eventSlug }));
    expect(mocks.revalidate.mock.calls).toEqual([[`/e/${eventSlug}`, "layout"], [`/admin/events/${eventId}`, "layout"]]);
  });
  it("preserves host notes and visibility preferences when guest-facing features are disabled", async () => {
    mocks.pub.mockResolvedValue({ ...publication, snapshot: { ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, guestList: false } } } });
    await expect(updateEventGuest(eventId, otherEventId, initial, form())).rejects.toThrow("REDIRECT");
    expect(mocks.update.mock.lastCall![1]).toMatchObject({ comment: "Private note", displayOnGuestList: true });
  });
  it("normalizes decline edits to null party size and hidden name", async () => {
    await expect(updateEventGuest(eventId, otherEventId, initial, form({ attending: "false", partySize: "20" }))).rejects.toThrow("saved=update");
    expect(mocks.update.mock.lastCall![1]).toMatchObject({ attending: false, partySize: null, displayOnGuestList: false });
  });
  it.each([{ guestName: " " }, { guestName: "x".repeat(121) }, { attending: "yes" }, { partySize: "0" }, { partySize: "5" }, { partySize: "1.5" }, { partySize: "NaN" }, { partySize: "" }, { comment: "x".repeat(1001) }])("rejects invalid fields before database mutation: %j", async (patch) => {
    expect((await createEventGuest(eventId, otherEventId, initial, form(patch))).error).toBeTruthy(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([createEventGuest, updateEventGuest, deleteEventGuest])("rejects invalid request/guest IDs", async (action) => {
    expect((await action(eventId, "bad-id", initial, form({ confirm: "delete" }))).error).toBeTruthy();
    for (const fn of [mocks.create, mocks.update, mocks.remove]) expect(fn).not.toHaveBeenCalled();
  });
  it("requires an explicit delete confirmation server-side", async () => {
    expect((await deleteEventGuest(eventId, otherEventId, initial, form())).error).toContain("confirm");
    expect(mocks.remove).not.toHaveBeenCalled();
    await expect(deleteEventGuest(eventId, otherEventId, initial, form({ confirm: "delete" }))).rejects.toThrow("saved=delete");
    expect(mocks.remove).toHaveBeenCalledWith(otherEventId, expect.objectContaining({ slug: eventSlug }));
  });
  it.each([[updateEventGuest, mocks.update], [deleteEventGuest, mocks.remove]] as const)("does not report success when a scoped row is absent", async (action, operation) => {
    operation.mockResolvedValue(false);
    expect((await action(eventId, otherEventId, initial, form({ confirm: "delete" }))).error).toContain("could not be found in this event");
    expect(mocks.redirect).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("returns a friendly storage failure without details or false success", async () => {
    mocks.create.mockRejectedValue(new Error("postgresql://secret-host"));
    const result = await createEventGuest(eventId, otherEventId, initial, form());
    expect(result.error).toContain("try again"); expect(result.error).not.toContain("postgresql"); expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
