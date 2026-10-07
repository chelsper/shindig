import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../app/admin/events/[id]/publish/actions", () => ({ publishEvent: vi.fn(), changeEventLifecycle: vi.fn(), checkEventLink: vi.fn() }));
import { isEventAlias, suggestEventAlias, validateEventAlias, RESERVED_EVENT_ALIASES } from "../lib/event-alias";
import { publicationEvent } from "../lib/event-publication";
import { calendarPath, createOysterRoastIcs, getRsvpUpdateUrl, getGoogleCalendarUrl, getOutlookCalendarUrl } from "../lib/calendar";
import { EventPublishReview } from "../components/admin/event-publish-review";
import { EventSharePanel } from "../components/admin/event-share-panel";
import { draft, snapshot, eventId, eventSlug, publication } from "./fixtures/publication";

describe("friendly event link validation", () => {
  it.each(RESERVED_EVENT_ALIASES)("reserves %s", (alias) => { expect(validateEventAlias(alias).ok).toBe(false); });
  it.each(["ab", "a".repeat(61), "party--time", "-party", "party-", "event-anything", eventSlug, "https://evil.test", "//evil.test", "../admin", "x?token=secret", "party_name", "party name", "🎉party", {}, 123])("rejects unsafe or malformed aliases: %s", (alias) => { expect(validateEventAlias(alias).ok).toBe(false); });
  it.each([undefined, null, "", "   "])("allows the original link as an explicit fallback: %s", (alias) => { expect(validateEventAlias(alias)).toEqual({ ok: true, alias: null }); });
  it("normalizes input without making mixed-case or encoded routes ambiguous", () => {
    expect(validateEventAlias("  Garden-Supper  ")).toEqual({ ok: true, alias: "garden-supper" });
    expect(isEventAlias("Garden-Supper")).toBe(false); expect(isEventAlias("garden-supper")).toBe(true); expect(isEventAlias("garden%2dsupper")).toBe(false);
  });
  it("suggests a safe title-based link without claiming availability", () => {
    expect(suggestEventAlias("Chloé’s Garden Supper!")).toBe("chloes-garden-supper");
    expect(suggestEventAlias("Admin")).toBe(""); expect(suggestEventAlias("🎉")).toBe("");
    expect(suggestEventAlias("Long title ".repeat(30)).length).toBeLessThanOrEqual(60);
  });
});
describe("friendly presentation preserves permanent identity", () => {
  const event = publicationEvent(eventId, snapshot, true, "garden-supper");
  it("uses the alias for presentation only", () => {
    expect(event.slug).toBe(eventSlug); expect(event.publicSlug).toBe("garden-supper");
    expect(event.websiteUrl).toBe("https://www.haveashindig.com/e/garden-supper"); expect(event.eventHub.path).toBe("/e/garden-supper/event");
    expect(event.calendarUid).toBe(`${eventSlug}@haveashindig.com`);
  });
  it("generates matching calendars and private edit links without changing UID", () => {
    const token = "a".repeat(43), url = getRsvpUpdateUrl(token, event);
    expect(url).toBe(`https://www.haveashindig.com/e/garden-supper/rsvp/${token}`); expect(calendarPath(event)).toBe("/e/garden-supper/calendar.ics");
    const ics = createOysterRoastIcs(new Date(), url, event).replaceAll("\r\n ", "");
    expect(ics).toContain(`UID:${eventSlug}@haveashindig.com`); expect(ics).toContain("URL:https://www.haveashindig.com/e/garden-supper/event"); expect(ics).toContain(url);
    for (const calendar of [getGoogleCalendarUrl(url, event), getOutlookCalendarUrl(url, event)]) expect(decodeURIComponent(calendar)).toContain("/e/garden-supper/event");
  });
});
describe("host sharing presentation", () => {
  const props = { draft, artwork: { settings: snapshot.artwork, revision: 0 }, settings: { settings: snapshot.settings, revision: 3 } };
  it("suggests a link before first publication without providing a public link or QR", () => {
    const html = renderToStaticMarkup(<EventPublishReview {...props} live={null} />);
    expect(html).toContain('value="garden-supper"'); expect(html).toContain("Check link"); expect(html).not.toContain('href="/e/'); expect(html).not.toContain("Get QR code");
  });
  it("locks the link after publishing and exposes only a public share target", () => {
    const html = renderToStaticMarkup(<EventPublishReview {...props} live={{ ...publication, coordinates: null, hasUnpublishedChanges: false, publicAlias: "garden-supper" }} />);
    expect(html).toContain('href="/e/garden-supper"'); expect(html).toContain("Copy link"); expect(html).toContain("Get QR code");
    expect(html).not.toContain('id="event-link"'); expect(html).not.toContain("?token=");
  });
  it.each(["unpublished", "archived"] as const)("hides all share controls while %s", (visibility) => {
    const html = renderToStaticMarkup(<EventPublishReview {...props} live={{ ...publication, visibility, rsvpsOpen: false, coordinates: null, hasUnpublishedChanges: false, publicAlias: "garden-supper" }} />);
    expect(html).not.toContain("Share your event"); expect(html).not.toContain("Get QR code"); expect(html).not.toContain('href="/e/');
  });
  it("preserves a compact original-link share panel for already-published events", () => {
    const html = renderToStaticMarkup(<EventSharePanel id={eventId} publicSlug={eventSlug} title={draft.title} rsvpsOpen={false} />);
    expect(html).toContain(`/e/${eventSlug}`); expect(html).toContain("RSVPs and guest edits are closed"); expect(html).toContain('aria-pressed="true"'); expect(html).toContain('aria-expanded="false"');
  });
});
