import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), save: vi.fn(), draft: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), revalidate: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-location", () => ({ findDraftAddress: mocks.find, confirmDraftLocation: mocks.save }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ refresh: vi.fn() }) }));
import { findEventAddress, saveEventLocation } from "../app/admin/events/[id]/location/actions";
import Page, { dynamic, metadata } from "../app/admin/events/[id]/location/page";
import { EventLocationEditor } from "../components/admin/event-location-editor";
import { parseEventLocation, locationNumbers } from "../lib/event-location";
import { LocationError, LocationConflictError } from "../lib/server/address-search";
import { draft } from "./fixtures/publication";
const location = { address: draft.address, matchedAddress: "123 EXAMPLE LANE", latitude: 30, longitude: -81, source: "census" as const };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft); mocks.redirect.mockImplementation(() => { throw Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw Error("not found"); }); });

describe("host location boundary and display", () => {
  it("keeps the editor mounted across saved revision revalidation", async () => {
    const before = await Page({ params: Promise.resolve({ id: draft.id }) });
    mocks.draft.mockResolvedValue({ ...draft, revision: draft.revision + 1, location });
    const after = await Page({ params: Promise.resolve({ id: draft.id }) });
    expect(before.key).toBe(draft.id); expect(after.key).toBe(before.key);
  });
  it("requires authentication before page reads and lookup/save actions", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(Page({ params: Promise.resolve({ id: draft.id }) })).rejects.toThrow("redirect");
    expect(await findEventAddress(draft.id, 2)).toMatchObject({ ok: false });
    expect(await saveEventLocation(draft.id, 2, location, true)).toMatchObject({ ok: false });
    for (const fn of [mocks.find, mocks.save, mocks.draft]) expect(fn).not.toHaveBeenCalled();
    expect(dynamic).toBe("force-dynamic"); expect(metadata.robots.index).toBe(false); expect(metadata.referrer).toBe("no-referrer");
  });
  it("rejects invalid/missing draft IDs and shows friendly storage errors", async () => {
    await expect(Page({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("not found");
    expect(mocks.draft).not.toHaveBeenCalled();
    mocks.draft.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: draft.id }) })).rejects.toThrow("not found");
    mocks.draft.mockRejectedValue(new Error("postgresql://secret"));
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: draft.id }) }));
    expect(html).toContain("migration 021"); expect(html).not.toContain("secret");
  });
  it("keeps raw provider/database errors out of action responses", async () => {
    mocks.find.mockRejectedValue(new Error("secret URL")); mocks.save.mockRejectedValue(new Error("secret SQL"));
    expect(JSON.stringify(await findEventAddress(draft.id, 2))).not.toContain("secret");
    expect(JSON.stringify(await saveEventLocation(draft.id, 2, location, true))).not.toContain("secret");
    mocks.save.mockRejectedValue(new LocationError("Please reload the draft."));
    expect(await saveEventLocation(draft.id, 2, location, true)).toEqual({ ok: false, message: "Please reload the draft." });
  });
  it("revalidates only host screens after an acknowledged save", async () => {
    mocks.save.mockResolvedValue({ revision: 3, location });
    expect(await saveEventLocation(draft.id, 2, location, true)).toEqual({ ok: true, revision: 3, location });
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/events"], [`/admin/events/${draft.id}`, "layout"]]);
    mocks.revalidate.mockImplementation(() => { throw Error("cache error"); });
    expect((await saveEventLocation(draft.id, 2, location, true)).ok).toBe(true);
  });
  it("renders a mobile-friendly explicit lookup, privacy note, timezone and fallback", () => {
    const html = renderToStaticMarkup(<EventLocationEditor draft={draft} />);
    expect(html).toContain("Find address"); expect(html).toContain("sends the saved address"); expect(html).toContain("U.S. Census");
    expect(html).toContain("Enter coordinates manually"); expect(html).toContain(draft.timeZone);
    expect(html).toContain("sm:grid-cols-2"); expect(html).toContain("min-h-11");
    expect(html).toContain('aria-label="Confirm &amp; save location"');
    expect(html).toMatch(/type="submit"[^>]*disabled=""/); expect(html).toContain('form="event-location-form"');
    expect(html).toContain("Continue setup"); expect(html).toContain("safe-area-inset-bottom");
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("renders saved confirmation without publishing or borrowing another event location", () => {
    const html = renderToStaticMarkup(<EventLocationEditor draft={{ ...draft, location }} />);
    expect(html).toContain("Location confirmed"); expect(html).toContain("30.00000, -81.00000");
    expect(html).toContain(`/admin/events/${draft.id}/publish`);
    expect(html).not.toContain("172 Belmont"); expect(mocks.save).not.toHaveBeenCalled();
    const empty = renderToStaticMarkup(<EventLocationEditor draft={{ ...draft, address: "" }} />);
    expect(empty).toContain("Save an address in Details first."); expect(empty).not.toContain(">Find address<");
  });
  it("strictly validates coordinates, address binding and source", () => {
    expect(parseEventLocation(location, draft.address)).toEqual(location);
    for (const value of [null, [], { ...location, source: "fake" }, { ...location, latitude: Infinity }, { ...location, longitude: 181 }, { ...location, latitude: "30" }, { ...location, matchedAddress: "x\nprivate" }]) expect(parseEventLocation(value, draft.address)).toBeNull();
    expect(parseEventLocation(location, "Changed")).toBeNull();
    for (const [lat, lon] of [["", "0"], ["0", " "], ["NaN", "0"], ["91", "0"]]) expect(locationNumbers(lat, lon)).toBeNull();
    expect(locationNumbers("0", "0")).toEqual({ latitude: 0, longitude: 0 });
  });
  it("marks stale revision failures for recovery, without changing other friendly failures", async () => {
    const error = new LocationConflictError("This draft changed. Reopen the saved location.");
    mocks.find.mockRejectedValue(error); mocks.save.mockRejectedValue(error);
    expect(await findEventAddress(draft.id, 2)).toEqual({ ok: false, conflict: true, message: error.message });
    expect(await saveEventLocation(draft.id, 2, location, true)).toEqual({ ok: false, conflict: true, message: error.message });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
