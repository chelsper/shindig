import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), scope: vi.fn(), publication: vi.fn(), list: vi.fn(), configuration: vi.fn() }));
vi.mock("../app/admin/invitations/actions", () => ({ changeInvitation: vi.fn(), refreshInvitationTracker: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/host-access", () => ({ isHostAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-scope", () => ({ getHostDraftScope: mocks.scope }));
vi.mock("../lib/server/event-publications", () => ({ getHostEventPublication: mocks.publication }));
vi.mock("../lib/server/invitation-tracker", () => ({ listInvitationTracker: mocks.list }));
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: mocks.configuration }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
import { filterInvitees, invitationStatus, invitationReminder, validateInvitationChange, type Invitee } from "../lib/invitation-tracker";
import { InvitationTrackerPanel } from "../components/admin/invitation-tracker";
import EventPage from "../app/admin/events/[id]/invitations/page";
import LegacyPage from "../app/admin/invitations/page";
import { eventId, otherEventId, draft, publication } from "./fixtures/publication";
const input = { kind: "save", id: eventId, revision: 0, guestName: "  Chelsea & Damon  ", email: " CHELSEA@example.com ", phone: "(904) 555-0123", invited: false };
const entry: Invitee = { id: eventId, revision: 1, guestName: "Chelsea & Damon", email: "chelsea@example.com", phone: "+19045550123", invited: false, response: null };
const response = { id: otherEventId, guestName: "Damon", attending: false, partySize: null };
const initial = { invitees: [entry, { ...entry, id: otherEventId, guestName: "Other household", invited: true }, { ...entry, id: "third", guestName: "Responded", invited: true, response }], responses: [response] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft); mocks.scope.mockResolvedValue({ slug: `event-${eventId}` }); mocks.publication.mockResolvedValue(null); mocks.list.mockResolvedValue(initial);
  mocks.configuration.mockResolvedValue({ title: "Oyster Roast", websiteUrl: "https://www.jaspershucks.app/" });
});
describe("invitation tracker contract", () => {
  it("normalizes contacts and strips anything that could imply a guest response or consent", () => {
    expect(validateInvitationChange({ ...input, rsvpId: otherEventId, attending: true, emailOptIn: true, ownerId: "someone" })).toEqual({ ok: true, change: { kind: "save", id: eventId, revision: 0, guestName: "Chelsea & Damon", email: "chelsea@example.com", phone: "+19045550123", invited: false } });
    expect(validateInvitationChange({ ...input, email: "", phone: "" })).toMatchObject({ ok: true, change: { email: null, phone: null } });
  });
  it.each([null, [], {}, { ...input, id: "bad" }, { ...input, revision: -1 }, { ...input, revision: 1.2 }, { ...input, guestName: " " }, { ...input, guestName: "x".repeat(121) }, { ...input, guestName: "Bad\nName" }, { ...input, invited: "true" }, { ...input, email: "bad" }, { ...input, email: "a@b.com\r\nBcc: x@y.com" }, { ...input, email: "a".repeat(255)+"@b.com" }, { ...input, phone: "911" }, { ...input, phone: "+1904;555" }, { ...input, phone: "+1234567890123456" }, { ...input, kind: "remove", confirmed: false }, { ...input, kind: "link", rsvpId: otherEventId, confirmed: "true" }, { ...input, kind: "sent", revision: 0 }])("rejects invalid changes %#", value => expect(validateInvitationChange(value).ok).toBe(false));
  it("filters waiting invitations without counting unsent or declined-linked households as waiting", () => {
    expect(initial.invitees.map(invitationStatus)).toEqual(["not-sent", "waiting", "responded"]);
    expect(filterInvitees(initial.invitees, "waiting", "")).toHaveLength(1);
    expect(filterInvitees(initial.invitees, "all", " CHELSEA ")).toHaveLength(3);
    expect(filterInvitees(initial.invitees, "responded", "+1904")).toHaveLength(1);
    expect(filterInvitees(initial.invitees, "not-sent", "other")).toHaveLength(0);
  });
  it("creates a simple reminder containing the correct invitation link, with no tracking or personal data", () => {
    const message = invitationReminder("Garden Supper", "https://www.haveashindig.com/e/garden-supper");
    expect(message).toContain("Garden Supper"); expect(message).toContain("/e/garden-supper"); expect(message).toContain("no need to RSVP again"); expect(message).not.toContain("example.com");
  });
  it("renders an event-specific private list with honest counts, privacy notice, large controls and no send action", () => {
    const html = renderToStaticMarkup(<InvitationTrackerPanel initial={initial} title="Garden Supper" invitationUrl="https://www.haveashindig.com/e/garden" />);
    expect(html).toContain("3 invitation entries, not a guest count"); expect(html).toContain("Can’t Make It"); expect(html).toContain("not an RSVP or permission for updates"); expect(html).toContain("Copy reminder message"); expect(html).toContain("min-h-11"); expect(html).not.toContain("mailto:"); expect(html).not.toContain("sms:"); expect(html).not.toContain("Confirm RSVP match");
  });
  it("keeps draft invitee entry available but hides inactive invitation links", () => {
    const html = renderToStaticMarkup(<InvitationTrackerPanel initial={{ invitees: [], responses: [] }} title="Garden Supper" invitationUrl={null} />);
    expect(html).toContain("+ Add invitee"); expect(html).toContain("Publish the event"); expect(html).not.toContain("Copy invitation link"); expect(html).not.toContain("Copy reminder message");
  });
});
describe("private invitation tracker routes", () => {
  it("checks authentication before any private data lookup", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(EventPage({ params: Promise.resolve({ id: eventId }) })).rejects.toThrow("REDIRECT");
    await expect(LegacyPage()).rejects.toThrow("REDIRECT");
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.draft).not.toHaveBeenCalled();
  });
  it("rejects invalid and nonowned event IDs before reading invitees", async () => {
    await expect(EventPage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    mocks.scope.mockResolvedValue(null); mocks.draft.mockResolvedValue(null);
    await expect(EventPage({ params: Promise.resolve({ id: eventId }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("supports drafts and links back to their overview, not a different event", async () => {
    const html = renderToStaticMarkup(await EventPage({ params: Promise.resolve({ id: eventId }) }));
    expect(html).toContain(`/admin/events/${eventId}/setup`); expect(html).toContain("Publish the event"); expect(mocks.list).toHaveBeenCalledWith({ slug: `event-${eventId}` });
  });
  it("uses published aliases and hides links for unpublished or archived events", async () => {
    mocks.publication.mockResolvedValue({ ...publication, publicAlias: "garden-supper" });
    const page = await EventPage({ params: Promise.resolve({ id: eventId }) });
    const children = page.props.children as React.ReactElement<{ invitationUrl: string | null }>[];
    expect(children[1].props.invitationUrl).toBe("https://www.haveashindig.com/e/garden-supper");
    for (const visibility of ["unpublished", "archived"]) {
      mocks.publication.mockResolvedValue({ ...publication, visibility });
      expect(renderToStaticMarkup(await EventPage({ params: Promise.resolve({ id: eventId }) }))).not.toContain("Copy invitation link");
    }
  });
  it("fails gracefully without false empty lists or database details", async () => {
    mocks.list.mockRejectedValue(new Error("private credentials"));
    for (const page of [await EventPage({ params: Promise.resolve({ id: eventId }) }), await LegacyPage()]) {
      const html = renderToStaticMarkup(page); expect(html).toContain("couldn’t load"); expect(html).not.toContain("private credentials"); expect(html).not.toContain("+ Add invitee");
    }
  });
});
