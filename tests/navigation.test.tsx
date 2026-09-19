import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/actions", () => ({ submitRsvp: vi.fn() }));
vi.mock("../lib/server/invitation-settings", async () => ({ getEventConfiguration: async () => (await import("../lib/oyster-roast-event")).OYSTER_ROAST_EVENT }));
vi.mock("../app/rsvp/actions", () => ({ updateRsvp: vi.fn() }));
vi.mock("../lib/server/rsvps", () => ({ getRsvpForGuest: vi.fn() }));
vi.mock("../lib/server/rsvp-edit-token", () => ({ hashRsvpEditToken: vi.fn().mockReturnValue("test-hash") }));

vi.mock("../app/admin/actions", () => ({ createAdminGuest: vi.fn(), updateAdminGuest: vi.fn(), deleteAdminGuest: vi.fn(), logoutAdmin: vi.fn() }));
vi.mock("../app/admin/event/actions", () => ({ saveEventHeaderSettings: vi.fn() }));
vi.mock("../app/admin/playlist/actions", () => ({ deleteAdminPlaylistSuggestion: vi.fn() }));
vi.mock("../app/admin/questions/actions", () => ({ answerGuestQuestion: vi.fn(), deleteGuestQuestion: vi.fn() }));
vi.mock("../app/admin/updates/actions", () => ({ createHostUpdate: vi.fn(), editHostUpdate: vi.fn(), deleteHostUpdate: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: vi.fn().mockResolvedValue(true) }));
vi.mock("../lib/server/playlist", () => ({ listPlaylistSuggestionsForAdmin: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/server/questions", () => ({ listQuestionsForAdmin: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/server/updates", () => ({ listHostUpdatesForAdmin: vi.fn().mockResolvedValue([]) }));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

import { AdminDashboard } from "../components/admin/admin-dashboard";
import { AdminGuestForm } from "../components/admin/admin-guest-form";
import { EventHeaderEditor } from "../components/admin/event-header-editor";
import { EventHubHeader } from "../components/event-hub/event-hub-header";
import { InvitationPage } from "../components/invitation-page";
import { RsvpUpdateForm } from "../components/rsvp/rsvp-update-form";
import RsvpUpdatePage from "../app/rsvp/[token]/page";
import { getRsvpForGuest } from "../lib/server/rsvps";
import AdminPlaylistPage from "../app/admin/playlist/page";
import AdminQuestionsPage from "../app/admin/questions/page";
import AdminUpdatesPage from "../app/admin/updates/page";
import { DEFAULT_EVENT_HUB_HEADER } from "../lib/event-hub-settings";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import type { AdminRsvp } from "../lib/server/rsvps";

const guest: AdminRsvp = {
  id: "9d366c85-1b73-4c3e-99e8-e751d75965aa",
  eventSlug: OYSTER_ROAST_EVENT.slug,
  guestName: "Navigation Test",
  attending: true,
  partySize: 1,
  displayOnGuestList: false,
  comment: null,
  createdAt: "2026-09-19T12:00:00Z",
  updatedAt: "2026-09-19T12:00:00Z",
};

function links(html: string) {
  return Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), ([, attributes, content]) => ({
    href: attributes.match(/\bhref="([^"]+)"/)?.[1],
    label: content.replace(/<[^>]+>/g, "").trim(),
    attributes,
  }));
}

describe("screen navigation", () => {
  beforeEach(() => { vi.mocked(getRsvpForGuest).mockReset(); });

  it("displays the current invitation description", () => {
    const html = renderToStaticMarkup(<InvitationPage persistenceDisabled={false} />);
    expect(html).toContain("Oysters on the fire, cold drinks in hand, and good food to go around. Come casual and stay awhile.");
    expect(html).not.toContain("come hungry");
  });

  it.each([false, true])("provides Hub navigation before any RSVP, including preview=%s", (persistenceDisabled) => {
    const html = renderToStaticMarkup(<InvitationPage persistenceDisabled={persistenceDisabled} />);
    const destinations = links(html).filter((link) => link.href === OYSTER_ROAST_EVENT.eventHub.path);
    expect(destinations).toHaveLength(2);
    expect(destinations[0].label).toContain("Event Hub");
    expect(destinations[1].label).toContain("View Event Hub");
    for (const link of destinations) {
      expect(link.attributes).toContain("min-h-11");
      expect(link.attributes).toContain("focus-visible:outline");
      expect(link.attributes).not.toContain('target="_blank"');
    }
    expect(html.indexOf('href="/event"')).toBeLessThan(html.indexOf("Oyster roast invitation artwork"));
    expect(html).toContain("No new RSVP needed to visit.");
    expect(html).not.toContain("RSVP received");
  });

  it.each([true, false])("provides a Hub exit before editing attending=%s without exposing the private token", (attending) => {
    const html = renderToStaticMarkup(<RsvpUpdateForm token={"a".repeat(43)} initialRsvp={{ ...guest, attending, partySize: attending ? 1 : null }} />);
    expect(links(html)).toContainEqual(expect.objectContaining({ href: OYSTER_ROAST_EVENT.eventHub.path, label: "Event Hub→" }));
    expect(links(html).some((link) => link.href?.includes("a".repeat(43)))).toBe(false);
    expect(html).not.toContain("RSVP updated");
  });

  it.each(["invalid", "missing", "failure"])("provides a Hub exit for an %s RSVP update link", async (state) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      if (state === "failure") vi.mocked(getRsvpForGuest).mockRejectedValue(new Error("offline"));
      else vi.mocked(getRsvpForGuest).mockResolvedValue(null);
      const html = renderToStaticMarkup(await RsvpUpdatePage({ params: Promise.resolve({ token: state === "invalid" ? "invalid" : "a".repeat(43) }) }));
      expect(links(html)).toContainEqual(expect.objectContaining({ href: OYSTER_ROAST_EVENT.eventHub.path, label: "View Event Hub→" }));
      expect(links(html)).toContainEqual(expect.objectContaining({ href: "/", label: "Return to invitation" }));
      expect(html).toContain(state === "failure" ? "We couldn’t load your RSVP." : "This update link isn’t available.");
    } finally { log.mockRestore(); }
  });

  it("makes the header-image dashboard pill an accessible link back to /admin", () => {
    const html = renderToStaticMarkup(<EventHeaderEditor initialSettings={DEFAULT_EVENT_HUB_HEADER} uploadConfigured={false} />);
    const dashboard = links(html).find((link) => link.label === "Host Dashboard");
    expect(dashboard?.href).toBe("/admin");
    expect(dashboard?.attributes).toContain("min-h-11");
    expect(dashboard?.attributes).toContain("focus-visible:outline");
    expect(dashboard?.attributes).not.toContain('target="_blank"');
    expect(links(html)).toContainEqual(expect.objectContaining({ label: "Shindig", href: "/admin" }));
    expect(links(html)).toContainEqual(expect.objectContaining({ label: "View Event Hub", href: OYSTER_ROAST_EVENT.eventHub.path }));
  });

  it.each(["create", "edit"] as const)("provides dashboard and cancel links on the %s guest screen", (mode) => {
    const html = renderToStaticMarkup(mode === "edit" ? <AdminGuestForm mode="edit" rsvp={guest} /> : <AdminGuestForm mode="create" />);
    for (const label of ["Shindig", "Host Dashboard", "Cancel"]) {
      expect(links(html)).toContainEqual(expect.objectContaining({ label, href: "/admin" }));
    }
  });

  it.each([
    ["Playlist", AdminPlaylistPage],
    ["Questions", AdminQuestionsPage],
    ["Updates", AdminUpdatesPage],
  ] as const)("returns from the %s screen to the dashboard", async (_label, Page) => {
    const html = renderToStaticMarkup(await Page());
    for (const label of ["Shindig", "Back to dashboard"]) {
      expect(links(html)).toContainEqual(expect.objectContaining({ label, href: "/admin" }));
    }
  });

  it("links from the dashboard to each host tool, filters, and guest editor", () => {
    const html = renderToStaticMarkup(<AdminDashboard filter="all" rsvps={[guest]} summary={{ totalAttending: 1, totalPartySize: 1, totalResponses: 1, declined: 0 }} />);
    const destinations = links(html).map((link) => link.href);
    for (const href of ["/admin/updates", "/admin/questions", "/admin/playlist", "/admin/event", "/admin/guests/new", `/admin/guests/${guest.id}/edit`, "/admin/export", "/admin", "/admin?status=attending", "/admin?status=declined"]) {
      expect(destinations).toContain(href);
    }
  });

  it("keeps mobile and desktop invitation links pointing to the invitation, not the admin area", () => {
    const html = renderToStaticMarkup(<EventHubHeader headerSettings={DEFAULT_EVENT_HUB_HEADER} />);
    for (const label of ["Invitation", "Return to invitation"]) {
      expect(links(html)).toContainEqual(expect.objectContaining({ label, href: "/" }));
    }
    expect(links(html)).toContainEqual(expect.objectContaining({ label: "Add to Calendar", href: "/calendar/oyster-roast.ics" }));
    expect(links(html).some((link) => link.href?.startsWith("/admin"))).toBe(false);
  });
});
