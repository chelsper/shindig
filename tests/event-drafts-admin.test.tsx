vi.mock("server-only", () => ({}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../lib/server/event-dashboard", () => ({ listHostEventCards: mocks.cards }));
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: mocks.legacy }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), save: vi.fn(), get: vi.fn(), artwork: vi.fn(), settings: vi.fn(), list: vi.fn(), cards: vi.fn(), legacy: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), replace: vi.fn() }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/host-auth", () => ({ getHostAccountSession: mocks.account }));
vi.mock("../lib/server/event-drafts", () => ({ saveEventDraftRecord: mocks.save, getEventDraft: mocks.get, listEventDrafts: mocks.list }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ replace: mocks.replace }) }));
import { saveEventDraft } from "../app/admin/events/actions";
import EventsPage from "../app/admin/events/page";
import NewPage from "../app/admin/events/new/page";
import EditPage from "../app/admin/events/[id]/page";
import { EventDraftEditor } from "../components/admin/event-draft-editor";
import { EMPTY_EVENT_DRAFT, type EventDraft } from "../lib/event-drafts";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import type { HostEventCard } from "../lib/event-dashboard";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";

const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const fields = { ...EMPTY_EVENT_DRAFT, title: "Birthday", startsAtLocal: "2026-11-07T17:00", endsAtLocal: "" };
const draft: EventDraft = { ...EMPTY_EVENT_DRAFT, title: "Private party", id, status: "draft", revision: 2, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
const card = (title: string, status: HostEventCard["status"] = "draft", cardId = id): HostEventCard => ({
  id: cardId, title, status, dateLabel: "Date to be decided", cityLabel: "", image: null, draftTitle: null, rsvpsOpen: status === "published", hasUnpublishedChanges: false,
  setupHref: `/admin/events/${cardId}/setup`, editHref: `/admin/events/${cardId}`,
  reviewHref: `/admin/events/${cardId}/publish`, duplicateHref: `/admin/events/duplicate/${cardId}`,
  guestsHref: status === "draft" ? null : `/admin/events/${cardId}/guests`,
  publicHref: status === "published" ? `/e/event-${cardId}` : null,
  shareHref: status === "published" ? `/admin/events/${cardId}/publish#share-event` : null,
});
const props = { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.save.mockResolvedValue({ id, revision: 1 }); mocks.get.mockResolvedValue(draft); mocks.list.mockResolvedValue([]);
  mocks.cards.mockResolvedValue([]); mocks.legacy.mockResolvedValue(OYSTER_ROAST_EVENT);
  mocks.artwork.mockResolvedValue({ settings: EMPTY_DRAFT_ARTWORK, revision: 0 });
  mocks.settings.mockResolvedValue({ settings: DEFAULT_DRAFT_SETTINGS, revision: 0 });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("private event draft actions and pages", () => {
  it("carries only a canonical playground style into a new private draft", async () => {
    const page = await NewPage({ searchParams: Promise.resolve({ style: "coastal" }) });
    expect(page.props.requestedDesign).toBe("coastal");
    expect(renderToStaticMarkup(page)).toContain("Next: apply Coastal");
    expect((await NewPage({ searchParams: Promise.resolve({ style: "https://evil.example" }) })).props.requestedDesign).toBeUndefined();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("checks the admin session before reads, form rendering or writes", async () => {
    mocks.auth.mockResolvedValue(false);
    expect(await saveEventDraft({ id, revision: 0, fields })).toMatchObject({ ok: false, message: expect.stringContaining("session") });
    for (const page of [() => EventsPage({}), () => EventsPage({ searchParams: Promise.resolve({ view: "archived" }) }), () => NewPage({}), () => EditPage(props)]) await expect(page()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/host/sign-in");
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.cards).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
    expect(mocks.artwork).not.toHaveBeenCalled(); expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("saves normalized event-local data and only refreshes private draft routes", async () => {
    expect(await saveEventDraft({ id, revision: 0, fields })).toEqual({ ok: true, id, revision: 1 });
    expect(mocks.save).toHaveBeenCalledWith(id, 0, { ...EMPTY_EVENT_DRAFT, title: "Birthday", startsAtUtc: "2026-11-07T22:00:00.000Z" });
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/events"], [`/admin/events/${id}`, "layout"]]);
  });
  it.each([null, {}, { id: "bad", revision: 0, fields }, { id, revision: -1, fields }, { id, revision: "0", fields }, { id, revision: 0, fields: { ...fields, title: " " } }, { id, revision: 0, fields: { ...fields, timeZone: "unknown" } }, { id, revision: 0, fields: { ...fields, startsAtLocal: "2026-03-08T02:30" } }])("rejects malformed writes before storage", async (input) => {
    expect((await saveEventDraft(input)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reports stale edits and missing drafts without claiming success", async () => {
    mocks.save.mockResolvedValue(null);
    expect(await saveEventDraft({ id, revision: 1, fields })).toMatchObject({ ok: false, conflict: true });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("returns friendly failure and keeps secrets out of errors and logs", async () => {
    mocks.save.mockRejectedValue(new Error("postgresql://secret@private/db"));
    const result = await saveEventDraft({ id, revision: 0, fields });
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps a draft private in one card alongside the original event", async () => {
    mocks.cards.mockResolvedValue([card("Private party")]);
    const html = renderToStaticMarkup(await EventsPage({}));
    for (const text of ["Published", "Manage Oyster Roast", "Private draft", "Private party", "Date to be decided", 'href="/admin/events/new"', `href="/admin/events/${id}/setup"`]) expect(html).toContain(text);
    expect((html.match(/<article /g) ?? []).length).toBe(2);
    expect(html).not.toContain("In the making"); expect(html).not.toContain("Submit RSVP");
  });
  it("uses one card for a published event and its saved changes", async () => {
    mocks.cards.mockResolvedValue([{ ...card("Live garden party", "published"), draftTitle: "New private name", hasUnpublishedChanges: true }]);
    const html = renderToStaticMarkup(await EventsPage({}));
    expect((html.match(new RegExp('id="event-' + id + '-title"', "g")) ?? []).length).toBe(1);
    for (const text of ["Live garden party", "New private name", "Changes waiting to publish", "Manage guests", "View live", "Share"]) expect(html).toContain(text);
    expect(html).not.toContain("In the making");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("removes archived events and their working copies from the active list", async () => {
    mocks.cards.mockResolvedValue([card("Archived gathering", "archived")]);
    const html = renderToStaticMarkup(await EventsPage({}));
    expect(html).toContain("Manage Oyster Roast"); expect(html).toContain("Archived (1)");
    expect(html).not.toContain("Archived gathering"); expect(html).not.toContain(`href="/admin/events/${id}/setup"`);
  });
  it("shows only archived events with retained host navigation and no live/share links", async () => {
    mocks.cards.mockResolvedValue([card("Archived gathering", "archived"), card("Still active", "published", "7ac5edab-22aa-447d-8931-91132a16798a")]);
    const html = renderToStaticMarkup(await EventsPage({ searchParams: Promise.resolve({ view: "archived" }) }));
    for (const text of ["Archived gathering", "View &amp; restore", "All saved data retained", `href="/admin/events/${id}/setup"`, "Manage guests"]) expect(html).toContain(text);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/admin\/events\?view=archived"/);
    for (const text of ["Manage Oyster Roast", "Still active", "View live", ">Share<", 'href="/e/']) expect(html).not.toContain(text);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("does not mistake a query failure for an empty archive", async () => {
    const params = { searchParams: Promise.resolve({ view: "archived" }) };
    expect(renderToStaticMarkup(await EventsPage(params))).toContain("No archived events yet");
    mocks.cards.mockRejectedValue(new Error("postgresql://secret"));
    const html = renderToStaticMarkup(await EventsPage(params));
    expect(html).toContain("Your event list couldn’t load");
    expect(html).not.toContain("No archived events yet"); expect(html).not.toContain("Archived (0)"); expect(html).not.toContain("secret");
  });
  it("keeps restored events private without a second working-copy card", async () => {
    mocks.cards.mockResolvedValue([{ ...card("Restored gathering", "unpublished"), draftTitle: "Private party" }]);
    const html = renderToStaticMarkup(await EventsPage({}));
    for (const text of ["Restored gathering", "Unpublished", "Private party", "Archived (0)", "Review &amp; republish"]) expect(html).toContain(text);
    expect((html.match(/<article /g) ?? []).length).toBe(2);
  });
  it.each(["unknown", ["archived"]])("ignores malformed list selectors %j", async (view) => {
    expect(renderToStaticMarkup(await EventsPage({ searchParams: Promise.resolve({ view }) }))).toContain("Manage Oyster Roast");
  });
  it("retains the original event and create action if the new event list fails", async () => {
    mocks.cards.mockRejectedValue(new Error("private connection string"));
    const html = renderToStaticMarkup(await EventsPage({}));
    for (const text of ["Your event list couldn’t load", "Manage Oyster Roast", "+ Create event", "Refresh to try again"]) expect(html).toContain(text);
    expect(html).not.toContain("private connection"); expect(html).not.toContain("No archived events yet");
  });
  it("uses current legacy settings and isolates their failure from other cards", async () => {
    mocks.legacy.mockResolvedValue({ ...OYSTER_ROAST_EVENT, title: "Updated original event" });
    expect(renderToStaticMarkup(await EventsPage({}))).toContain("Updated original event");
    mocks.legacy.mockRejectedValue(new Error("private legacy detail"));
    mocks.cards.mockResolvedValue([card("A saved draft")]);
    const html = renderToStaticMarkup(await EventsPage({}));
    expect(html).toContain("Oyster Roast details couldn’t load"); expect(html).toContain("A saved draft");
    expect(html).not.toContain("private legacy detail"); expect(html).not.toContain(OYSTER_ROAST_EVENT.dateLabel);
  });
  it("keeps individual host cards separate from legacy tools and preserves sign-out", async () => {
    mocks.auth.mockResolvedValue(false);
    mocks.account.mockResolvedValue({ id: "host-one", name: "One", email: "one@example.test" });
    mocks.cards.mockResolvedValue([card("Private party")]);
    const html = renderToStaticMarkup(await EventsPage({}));
    expect(html).toContain("one@example.test"); expect(html).toContain("Sign out"); expect(html).toContain("Private party");
    expect(html).not.toContain("Manage Oyster Roast"); expect(mocks.legacy).not.toHaveBeenCalled();
    mocks.cards.mockResolvedValue([]);
    expect(renderToStaticMarkup(await EventsPage({}))).toContain("Room for your next good gathering");
  });
  it("starts a blank draft with a unique creation key without database writes", async () => {
    const first = await NewPage({}), second = await NewPage({});
    expect(first.props.id).not.toEqual(second.props.id);
    const html = renderToStaticMarkup(first);
    for (const text of ["Let’s make a Shindig", "Save draft", "Hosted by (optional)", "Event timezone", "There is no guest link yet."]) expect(html).toContain(text);
    expect(html).not.toMatch(/value="Another Annualish|172 Belmont|Publish invitation/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reopens stored details and protects against missing/malformed draft IDs", async () => {
    expect(renderToStaticMarkup(await EditPage(props))).toContain("Private party");
    mocks.get.mockClear();
    await expect(EditPage({ ...props, params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("not found");
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue(null);
    await expect(EditPage(props)).rejects.toThrow("not found");
  });
  it("renders escaped user content and an explicit private save confirmation", () => {
    const html = renderToStaticMarkup(<EventDraftEditor id={id} initialDraft={{ ...draft, title: "<script>unsafe</script>" }} justSaved timeZones={["America/New_York"]} />);
    expect(html).not.toContain("<script>unsafe"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Draft saved privately. Review and publish when you’re ready to update guest pages.");
    expect(html).toContain('href="/admin/events"');
  });
  it("loads only this draft’s saved preview context after confirming the draft exists", async () => {
    const page = await EditPage(props);
    expect(page.key).toBe(id);
    expect(mocks.artwork).toHaveBeenCalledExactlyOnceWith(id); expect(mocks.settings).toHaveBeenCalledExactlyOnceWith(id);
    expect(page.props.previewContext).toEqual({ artwork: EMPTY_DRAFT_ARTWORK, settings: { settings: DEFAULT_DRAFT_SETTINGS, revision: 0 } });
    expect(mocks.get.mock.invocationCallOrder[0]).toBeLessThan(mocks.artwork.mock.invocationCallOrder[0]);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it.each(["artwork", "settings"] as const)("keeps details editable when %s preview loading fails", async (part) => {
    mocks[part].mockRejectedValue(new Error("postgresql://secret"));
    const page = await EditPage(props);
    expect(page.props.previewContext).toBeNull();
    const html = renderToStaticMarkup(page);
    expect(html).toContain('value="Private party"'); expect(html).toContain("preview is unavailable");
    expect(html).not.toContain("secret"); expect(html).not.toContain("RSVP preview uses suggested defaults");
  });
  it("does not load optional preview data for missing drafts or when creating one", async () => {
    mocks.get.mockResolvedValue(null); await expect(EditPage(props)).rejects.toThrow("not found");
    await NewPage({});
    expect(mocks.artwork).not.toHaveBeenCalled(); expect(mocks.settings).not.toHaveBeenCalled();
  });
});
