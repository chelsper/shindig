import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), guest: vi.fn(), list: vi.fn(), summary: vi.fn(), scope: vi.fn(), published: vi.fn() }));
vi.mock("../app/admin/actions", () => ({ createAdminGuest: vi.fn(), updateAdminGuest: vi.fn(), deleteAdminGuest: vi.fn() }));
vi.mock("../app/admin/events/[id]/guests/actions", () => ({ createEventGuest: vi.fn(), updateEventGuest: vi.fn(), deleteEventGuest: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/admin-event-guests", () => ({ getAdminGuestEvent: mocks.resolve }));
vi.mock("../lib/server/event-publications", () => ({ getPublishedEvent: mocks.published }));
vi.mock("../lib/server/event-scope", () => ({ resolvePublicEventScope: mocks.scope }));
vi.mock("../lib/server/rsvps", () => ({ getRsvpForAdmin: mocks.guest, listRsvps: mocks.list, getRsvpSummary: mocks.summary }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
import { AdminGuestForm } from "../components/admin/admin-guest-form";
import { EventGuestEditorPage } from "../components/admin/event-guest-editor-page";
import { EventGuestList } from "../components/admin/event-guest-list";
import GuestPage from "../app/admin/events/[id]/guests/page";
import { guestListQuery } from "../lib/admin-guests";
import { eventId, otherEventId, eventSlug, snapshot } from "./fixtures/publication";
const event = { id: eventId, title: "Garden Supper", maxPartySize: 4, guestListDefaultVisible: false, guestListEnabled: false, requestId: otherEventId };
const guest = { id: otherEventId, eventSlug, guestName: "A & B", attending: true, partySize: 3, displayOnGuestList: false, comment: "Private note", createdAt: "2026-11-08T01:00:00.000Z", updatedAt: "2026-11-08T02:00:00.000Z" };
const summary = { totalPartySize: 5, totalResponses: 3, totalAttending: 2, declined: 1 };
const scope = { slug: eventSlug, rsvp: snapshot.settings.rsvp, features: snapshot.settings.features };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue(true); mocks.resolve.mockResolvedValue({ event: { title: event.title }, scope }); mocks.guest.mockResolvedValue(guest);
  mocks.published.mockResolvedValue({ title: event.title, timeZone: "America/Los_Angeles", features: snapshot.settings.features }); mocks.scope.mockResolvedValue(scope); mocks.list.mockResolvedValue([guest]); mocks.summary.mockResolvedValue(summary);
});
describe("event guest editor and list", () => {
  it.each(["create", "edit"] as const)("keeps %s navigation in this event and applies its party limit", (mode) => {
    const html = renderToStaticMarkup(mode === "create" ? <AdminGuestForm mode="create" event={event} /> : <AdminGuestForm mode="edit" event={event} rsvp={guest} />);
    expect(html).toContain(`href="/admin/events/${eventId}/guests"`); expect(html).not.toContain('href="/admin"');
    expect(html).toContain('value="4"'); expect(html).not.toContain('value="5"');
    expect(html).toContain("Garden Supper"); expect(html).toContain("The Guest List module is off");
    expect(html).toContain('name="comment"'); expect(html).not.toContain('checked="" name="displayOnGuestList"');
  });
  it("asks for a new party size when an older RSVP exceeds the published limit", () => {
    const html = renderToStaticMarkup(<AdminGuestForm mode="edit" event={event} rsvp={{ ...guest, partySize: 8 }} />);
    expect(html).toContain("Previously 8"); expect(html).toContain('value="" disabled="" selected=""');
  });
  it("shows only name and optional comment for a decline", () => {
    const html = renderToStaticMarkup(<AdminGuestForm mode="edit" event={event} rsvp={{ ...guest, attending: false, partySize: null }} />);
    expect(html).not.toContain('name="partySize"'); expect(html).not.toContain('name="displayOnGuestList"'); expect(html).toContain('name="guestName"');
  });
  it("does not render a delete submit control before confirmation", () => {
    const html = renderToStaticMarkup(<AdminGuestForm mode="edit" event={event} rsvp={guest} />);
    expect(html).toMatch(/<button type="button"[^>]*aria-expanded="false"[^>]*>Delete Guest<\/button>/);
    expect(html).not.toContain("Yes, delete RSVP");
    expect(html).not.toContain('name="confirm"');
  });
  it("renders scoped search/filter/add/edit/export links and full totals with local timestamps", () => {
    const html = renderToStaticMarkup(<EventGuestList id={eventId} timeZone="America/Los_Angeles" responses={[guest]} summary={summary} filter="attending" q="A & B" saved="update" />);
    expect(html).toContain("RSVP updated."); expect(html).toContain("Showing 1 of 3 responses"); expect(html).toContain("5</strong>guests attending");
    for (const path of ["new", "export", `${otherEventId}/edit`]) expect(html).toContain(`href="/admin/events/${eventId}/guests/${path}"`);
    expect(html).toContain("filter=declined&amp;q=A+%26+B"); expect(html).toContain('aria-current="page"');
    expect(html).toContain("Nov 7, 2026, 5:00 PM"); expect(html).toContain("Last updated"); expect(html).toContain("Name hidden");
  });
  it("distinguishes an empty event from no matching results", () => {
    const props = { id: eventId, timeZone: "UTC", responses: [], filter: "declined" as const, q: "Nobody" };
    expect(renderToStaticMarkup(<EventGuestList {...props} summary={summary} />)).toContain("No guests match");
    expect(renderToStaticMarkup(<EventGuestList {...props} summary={{ ...summary, totalResponses: 0 }} />)).toContain("No responses yet");
  });
  it("normalizes untrusted search parameters", () => {
    expect(guestListQuery({ q: ["bad"], filter: ["attending"] })).toEqual({ q: "", filter: "all" });
    expect(guestListQuery({ q: "  Test  ", filter: "declined" })).toEqual({ q: "Test", filter: "declined" });
    expect(guestListQuery({ q: "a".repeat(300) }).q).toHaveLength(120);
  });
  it("queries filtered records in this scope without filtering headline totals", async () => {
    await GuestPage({ params: Promise.resolve({ id: eventId }), searchParams: Promise.resolve({ filter: "declined", q: "  Test  " }) });
    expect(mocks.list).toHaveBeenCalledWith("declined", scope, "Test"); expect(mocks.summary).toHaveBeenCalledWith(scope);
  });
  it("protects both editors before reading event or guest records", async () => {
    mocks.auth.mockResolvedValue(false);
    for (const guestId of [undefined, otherEventId]) await expect(EventGuestEditorPage({ id: eventId, guestId })).rejects.toThrow("REDIRECT");
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.guest).not.toHaveBeenCalled();
  });
  it("scopes edit lookup, returning 404 when a guest belongs elsewhere", async () => {
    mocks.guest.mockResolvedValue(null);
    await expect(EventGuestEditorPage({ id: eventId, guestId: otherEventId })).rejects.toThrow("NOT_FOUND");
    expect(mocks.guest).toHaveBeenCalledWith(otherEventId, scope);
  });
  it("does not expose an editor for an unpublished event or malformed IDs", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(EventGuestEditorPage({ id: eventId })).rejects.toThrow("NOT_FOUND");
    await expect(EventGuestEditorPage({ id: "invalid" })).rejects.toThrow("NOT_FOUND");
    expect(mocks.guest).not.toHaveBeenCalled();
  });
  it("shows a friendly failure without a misleading editable form", async () => {
    mocks.guest.mockRejectedValue(new Error("secret database details"));
    const html = renderToStaticMarkup(await EventGuestEditorPage({ id: eventId, guestId: otherEventId }));
    expect(html).toContain("Guest details couldn’t load"); expect(html).not.toContain("secret database"); expect(html).not.toContain("Save Changes");
  });
});
