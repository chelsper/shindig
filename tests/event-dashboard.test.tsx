import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HostEventList, HostEventCardView } from "../components/admin/host-event-list";
import { eventCardDate, legacyEventCard, type HostEventCard } from "../lib/event-dashboard";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { eventId } from "./fixtures/publication";
const base = `/admin/events/${eventId}`;
const event: HostEventCard = { id: eventId, title: "Garden Supper", draftTitle: null, dateLabel: "Nov 7, 2026, 5:00 PM PST", cityLabel: "Example City", image: null, status: "published", rsvpsOpen: true, hasUnpublishedChanges: false, setupHref: base + "/setup", editHref: base, guestsHref: base + "/guests", reviewHref: base + "/publish", shareHref: base + "/publish#share-event", publicHref: "/e/garden-supper", duplicateHref: "/admin/events/duplicate/" + eventId };

describe("unified event cards", () => {
  it("renders a single semantic card with distinct editor, guests, live and share destinations", () => {
    const html = renderToStaticMarkup(<HostEventList events={[event]} />);
    expect((html.match(/<article /g) ?? []).length).toBe(1);
    for (const href of [base, base + "/setup", base + "/guests", base + "/publish#share-event", "/e/garden-supper", event.duplicateHref]) expect(html).toContain(`href="${href}"`);
    for (const text of ["Edit event", "Manage guests", "View live", "Share", "Published", event.dateLabel, event.cityLabel]) expect(html).toContain(text);
    expect(html).not.toContain("Changes waiting"); expect(html).not.toContain("<form");
  });
  it("uses the semantic changes indicator and directs it to the review", () => {
    const html = renderToStaticMarkup(<HostEventCardView event={{ ...event, hasUnpublishedChanges: true, draftTitle: "New draft title" }} />);
    expect(html).toContain("Changes waiting to publish"); expect(html).toContain(base + "/publish#publication-changes");
    expect(html).toContain("Saved draft name"); expect(html).toContain("New draft title"); expect(html).toContain(">Garden Supper</a>");
  });
  it.each(["draft", "unpublished", "archived"] as const)("never renders guest links or share controls while %s, even with supplied stale paths", (status) => {
    const html = renderToStaticMarkup(<HostEventCardView event={{ ...event, status, guestsHref: status === "draft" ? null : event.guestsHref }} />);
    expect(html).not.toContain('href="/e/'); expect(html).not.toContain('href="' + event.shareHref + '"'); expect(html).not.toContain("View live");
    expect(html).toContain(status === "draft" ? "Review &amp; publish" : status === "archived" ? "View &amp; restore" : "Review &amp; republish");
    expect(html.includes("Manage guests")).toBe(status !== "draft");
  });
  it("keeps manual RSVP closure distinct from publication", () => {
    const html = renderToStaticMarkup(<HostEventCardView event={{ ...event, rsvpsOpen: false }} />);
    expect(html).toContain("Published · RSVPs closed"); expect(html).toContain("View live"); expect(html).toContain("Manage guests");
  });
  it("uses private artwork URLs, contained images and a decorative fallback without artwork", () => {
    const html = renderToStaticMarkup(<HostEventCardView event={{ ...event, image: { src: base + "/artwork/image?path=sample", alt: "Saved picture" } }} />);
    expect(html).toContain("object-contain"); expect(html).toContain('alt="Saved picture"');
    expect(renderToStaticMarkup(<HostEventCardView event={event} />)).toContain('aria-hidden="true"');
  });
  it("keeps narrow layouts wrap-safe and escape-safe for long host text", () => {
    const html = renderToStaticMarkup(<HostEventCardView event={{ ...event, title: '<script>alert("x")</script>' + "LongName".repeat(25) }} />);
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("grid-cols-2"); expect(html).toContain("min-h-11"); expect(html).toContain("[overflow-wrap:anywhere]");
  });
  it("shows distinct empty active and archived states", () => {
    expect(renderToStaticMarkup(<HostEventList events={[]} />)).toContain("Room for your next good gathering");
    expect(renderToStaticMarkup(<HostEventList events={[]} archived />)).toContain("No archived events yet");
  });
  it("preserves the original event's routes, saved artwork and calendar timezone", () => {
    const legacy = legacyEventCard({ ...OYSTER_ROAST_EVENT, title: "A revised Oyster Roast", invitation: { ...OYSTER_ROAST_EVENT.invitation, imageUrl: "/saved-legacy.png" } });
    const html = renderToStaticMarkup(<HostEventCardView event={legacy} />);
    expect(legacy.editHref).toBe("/admin/invitation"); expect(legacy.image?.src).toBe("/saved-legacy.png");
    expect(legacy.dateLabel).toContain("5:00 PM EST");
    for (const text of ["A revised Oyster Roast", "Manage Oyster Roast", 'href="/admin"', 'href="/admin/events/duplicate/oyster-roast-2026"', 'aria-expanded="false"']) expect(html).toContain(text);
    expect(html).not.toContain('href="/e/event-oyster-roast'); expect(html).not.toContain('href="/e/oyster');
  });
  it("formats event time rather than the current device timezone and supports unset dates", () => {
    expect(eventCardDate(null, "America/New_York")).toBe("Date to be decided");
    expect(eventCardDate("2026-10-09T21:00:00.000Z", "America/New_York")).toContain("5:00 PM EDT");
    expect(eventCardDate("2026-11-07T22:00:00.000Z", "America/New_York")).toContain("5:00 PM EST");
  });
});
