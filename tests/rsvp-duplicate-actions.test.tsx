import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), scope: vi.fn(), resolve: vi.fn(), list: vi.fn(), decide: vi.fn(), refresh: vi.fn(), invalidate: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: m.auth }));
vi.mock("../lib/server/host-access", () => ({ isHostAuthenticated: m.auth }));
vi.mock("../lib/server/host-event", () => ({ hostScopeArgs: m.scope, refreshHostEvent: m.refresh }));
vi.mock("../lib/server/admin-event-guests", () => ({ getAdminGuestEvent: m.resolve }));
vi.mock("../lib/server/rsvp-duplicates", () => ({ listPossibleDuplicateRsvps: m.list, decideRsvpDuplicate: m.decide }));
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: async () => ({ timeZone: "UTC" }) }));
vi.mock("next/cache", () => ({ revalidatePath: m.invalidate }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
import { refreshDuplicateReview, reviewDuplicateRsvp } from "../app/admin/guests/duplicates/actions";
import LegacyPage from "../app/admin/guests/duplicates/page";
import EventPage from "../app/admin/events/[id]/guests/duplicates/page";
import { DuplicateReviewError } from "../lib/rsvp-duplicates";
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue(true); m.scope.mockResolvedValue([{ slug: "event-test" }]); m.list.mockResolvedValue({ pairs: [], total: 0 }); m.decide.mockResolvedValue("merged"); m.resolve.mockResolvedValue({ scope: { slug: "event-test" }, event: { title: "Test event", timeZone: "UTC" } }); });
describe("private duplicate review boundaries", () => {
  it("checks host ownership on every action before touching RSVP data", async () => {
    m.scope.mockRejectedValue(new Error("Not owned"));
    expect((await refreshDuplicateReview("foreign")).ok).toBe(false);
    expect((await reviewDuplicateRsvp({}, "foreign")).ok).toBe(false);
    expect(m.list).not.toHaveBeenCalled(); expect(m.decide).not.toHaveBeenCalled();
  });
  it("passes only resolved scope and invalidates host/public views after saving", async () => {
    expect((await reviewDuplicateRsvp({ action: "merge" }, "event-test")).ok).toBe(true);
    expect(m.scope).toHaveBeenCalledWith("event-test");
    expect(m.decide).toHaveBeenCalledWith({ action: "merge" }, { slug: "event-test" });
    expect(m.refresh).toHaveBeenCalledWith("event-test"); expect(m.invalidate).toHaveBeenCalledWith("/event");
  });
  it("never reports success on failure or exposes database internals", async () => {
    m.decide.mockRejectedValue(new Error("postgres://password-secret"));
    const result = await reviewDuplicateRsvp({});
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("password-secret"); expect(m.invalidate).not.toHaveBeenCalled();
    m.decide.mockRejectedValue(new DuplicateReviewError("Refresh the reviewed responses."));
    expect(await reviewDuplicateRsvp({})).toEqual({ ok: false, message: "Refresh the reviewed responses." });
  });
  it("protects both pages before reading names", async () => {
    m.auth.mockResolvedValue(false);
    await expect(LegacyPage()).rejects.toThrow("REDIRECT");
    await expect(EventPage({ params: Promise.resolve({ id: "test" }) })).rejects.toThrow("REDIRECT");
    expect(m.list).not.toHaveBeenCalled(); expect(m.resolve).not.toHaveBeenCalled();
  });
  it("keeps an owned event's navigation scoped and rejects foreign events", async () => {
    const html = renderToStaticMarkup(await EventPage({ params: Promise.resolve({ id: "test" }) }));
    expect(html).toContain('href="/admin/events/test/guests"'); expect(html).toContain("No possible duplicates");
    m.resolve.mockResolvedValue(null);
    await expect(EventPage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("shows a friendly error instead of an empty clean-list claim if storage fails", async () => {
    m.list.mockRejectedValue(new Error("db-secret"));
    const html = renderToStaticMarkup(await LegacyPage());
    expect(html).toContain("couldn’t load"); expect(html).not.toContain("db-secret"); expect(html).not.toContain("No possible duplicates");
    m.resolve.mockRejectedValue(new Error("db-secret"));
    const owned = renderToStaticMarkup(await EventPage({ params: Promise.resolve({ id: "test" }) }));
    expect(owned).toContain("couldn’t load"); expect(owned).not.toContain("db-secret");
  });
});
