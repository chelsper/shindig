import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), artwork: vi.fn(), settings: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
import Preview, { metadata, dynamic } from "../app/admin/events/[id]/preview/page";
import Invitation from "../app/e/[slug]/page";
import Hub from "../app/e/[slug]/event/page";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { EMPTY_EVENT_DRAFT } from "../lib/event-drafts";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { draftEventSlug } from "../lib/event-routes";
const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const draft = { ...EMPTY_EVENT_DRAFT, title: "Garden supper", id, status: "draft", revision: 1, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z", address: "123 Example Lane", startsAtUtc: "2026-11-07T22:00:00.000Z" };
const context = (view?: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ view }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft);
  mocks.artwork.mockResolvedValue({ settings: EMPTY_DRAFT_ARTWORK, revision: 0 });
  mocks.settings.mockResolvedValue({ settings: DEFAULT_DRAFT_SETTINGS, revision: 1 });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
});
describe("guarded future event routes", () => {
  it.each([Invitation, Hub])("does not reveal drafts even to a signed-in host", async (page) => {
    for (const slug of [draftEventSlug(id), "unknown", "../admin"]) await expect(page({ params: Promise.resolve({ slug }) })).rejects.toThrow("not found");
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.artwork).not.toHaveBeenCalled(); expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("keeps the existing live invitation and Hub as canonical destinations", async () => {
    const params = Promise.resolve({ slug: "oyster-roast-2026" });
    await expect(Invitation({ params })).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenLastCalledWith("/invitation");
    await expect(Hub({ params })).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenLastCalledWith("/event");
  });
});
describe("full-page host preview", () => {
  it("authenticates before private reads and avoids indexable/cached static content", async () => {
    mocks.auth.mockResolvedValue(false); await expect(Preview(context())).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    for (const fn of [mocks.draft, mocks.settings, mocks.artwork]) expect(fn).not.toHaveBeenCalled();
    expect(metadata.robots).toEqual({ index: false, follow: false }); expect(metadata.referrer).toBe("no-referrer"); expect(dynamic).toBe("force-dynamic");
  });
  it("shows only saved draft details, event-local time and disabled RSVP controls", async () => {
    const html = renderToStaticMarkup(await Preview(context()));
    for (const text of ["Garden supper", "123 Example Lane", "5:00 PM EST", "Not published"]) expect(html).toContain(text);
    expect(html).toMatch(/<h1[^>]*>Garden supper/); expect(html).toContain("lg:grid-cols-2");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit RSVP/);
    expect(html).not.toMatch(/<form|172 Belmont|Oyster Roast|spotify.com|action=/);
    expect(html).toContain(`href="/admin/events/${id}/preview?view=hub"`);
    expect(html).not.toContain(`href="/e/event-${id}`);
  });
  it("keeps all preview navigation private and respects enabled module choices", async () => {
    const html = renderToStaticMarkup(await Preview(context("hub")));
    expect(html).toContain("Who’s Coming"); expect(html).not.toContain("Ask the Host");
    expect(html).toContain("No guest data, songs, questions, polls or weather are loaded");
    expect(html).toContain(`href="/admin/events/${id}/preview"`);
    expect(html).toContain(`href="/admin/events/${id}/settings"`);
    expect(html).toMatch(/disabled=""[^>]*>Add to Calendar/); expect(html).toMatch(/disabled=""[^>]*>Get Directions/);
    expect(html).not.toMatch(/href="\/(event|invitation)"/);
  });
  it("labels unsaved defaults and provides a clear no-module experience", async () => {
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, guestList: false } }, revision: 0 });
    const html = renderToStaticMarkup(await Preview(context("hub")));
    expect(html).toContain("suggested defaults"); expect(html).toContain("no optional modules are selected"); expect(html).not.toContain("Who’s Coming");
  });
  it("uses only the protected image route and preserves the header crop", async () => {
    const path = `event-drafts/${id}/invitation/7ac5edab-22aa-447d-8931-91132a16798a.png`;
    mocks.artwork.mockResolvedValue({ settings: { ...EMPTY_DRAFT_ARTWORK, invitation: { path, alt: "Garden artwork" }, header: { ...EMPTY_DRAFT_ARTWORK.header, focalY: 30, zoomPercent: 120 } }, revision: 1 });
    const html = renderToStaticMarkup(await Preview(context("hub")));
    expect(html).toContain(`/admin/events/${id}/artwork/image?`); expect(html).not.toContain("/_next/image");
    expect(html).toContain("object-position:50% 30%"); expect(html).toContain("scale(1.2)"); expect(html).toContain("sm:aspect-[16/5]");
  });
  it("handles incomplete drafts and failures without falling back to live content", async () => {
    mocks.draft.mockResolvedValue({ ...draft, startsAtUtc: null, address: "" });
    let html = renderToStaticMarkup(await Preview(context())); expect(html).toContain("Date &amp; time to come"); expect(html).toContain("Location to come");
    mocks.settings.mockRejectedValue(new Error("postgresql://secret"));
    html = renderToStaticMarkup(await Preview(context())); expect(html).toContain("Preview couldn’t load"); expect(html).not.toContain("secret");
  });
  it("rejects missing and malformed event IDs", async () => {
    await expect(Preview({ ...context(), params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("not found"); expect(mocks.draft).not.toHaveBeenCalled();
    mocks.draft.mockResolvedValue(null); await expect(Preview(context())).rejects.toThrow("not found");
  });
});
