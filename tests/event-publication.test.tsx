import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../app/actions", () => ({ submitRsvp: vi.fn() }));
vi.mock("../app/e/actions", () => ({ submitEventRsvp: vi.fn(), updateEventRsvp: vi.fn() }));
vi.mock("../app/rsvp/actions", () => ({ updateRsvp: vi.fn() }));
vi.mock("../app/admin/events/[id]/publish/actions", () => ({ publishEvent: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { parsePublicationSnapshot, publicationEvent, publicationProblems, parseCoordinates } from "../lib/event-publication";
import { CalendarActions } from "../components/calendar-actions";
import { InvitationPage } from "../components/invitation-page";
import { RsvpUpdateForm } from "../components/rsvp/rsvp-update-form";
import { EventPublishReview } from "../components/admin/event-publish-review";
import { createOysterRoastIcs, getRsvpUpdateUrl, calendarPath } from "../lib/calendar";
import { eventId, eventSlug, draft, snapshot } from "./fixtures/publication";
import { availableLifecycleActions, eventStatus, hasUnpublishedChanges } from "../lib/event-lifecycle";

describe("publication validation and public projection", () => {
  it("requires real calendar times, address and valid settings", () => {
    expect(publicationProblems(snapshot)).toEqual([]);
    for (const key of ["startsAtUtc", "endsAtUtc"] as const) expect(() => parsePublicationSnapshot(eventId, { ...snapshot, details: { ...draft, [key]: null } })).toThrow();
    expect(() => parsePublicationSnapshot(eventId, { ...snapshot, details: { ...draft, address: "" } })).toThrow();
    expect(() => parsePublicationSnapshot(eventId, { ...snapshot, settings: { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, maxPartySize: 21 } } })).toThrow();
  });
  it("never guesses coordinates or defaults to the Oyster Roast location", () => {
    const weather = { ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, weather: true } } };
    expect(() => parsePublicationSnapshot(eventId, weather)).toThrow();
    expect(parsePublicationSnapshot(eventId, { ...weather, coordinates: { latitude: 37.7, longitude: -122.4 } }).coordinates).toEqual({ latitude: 37.7, longitude: -122.4 });
    for (const value of [null, {}, { latitude: 100, longitude: 0 }, { latitude: 0, longitude: Infinity }, { latitude: "30", longitude: -80 }]) expect(parseCoordinates(value)).toBeNull();
  });
  it("projects only reviewed public data, uses event-local time and stable event routes", () => {
    const event = publicationEvent(eventId, snapshot);
    expect(event.timeLabel).toBe("5:00 PM PST"); expect(event.dateLabel).toBe("Saturday, November 7, 2026");
    expect(event.eventHub.path).toBe(`/e/${eventSlug}/event`); expect(event.coordinates).toBeNull();
    expect(event.rsvp).toEqual(snapshot.settings.rsvp);
    const serialized = JSON.stringify(event);
    for (const privateKey of ["createdAt", "updatedAt", "revision", "event-drafts/", "172 Belmont", "/admin/"]) expect(serialized).not.toContain(privateKey);
    expect(publicationEvent(eventId, { ...snapshot, details: { ...draft, title: "Changed" } }).websiteUrl).toBe(event.websiteUrl);
  });
  it("maps saved artwork into role-based published URLs without leaking storage paths", () => {
    const path = `event-drafts/${eventId}/invitation/7ac5edab-22aa-447d-8931-91132a16798a.png`;
    const event = publicationEvent(eventId, { ...snapshot, artwork: { ...snapshot.artwork, invitation: { path, alt: "Garden" } } });
    expect(event.invitation.imageUrl).toBe(`/e/${eventSlug}/artwork/invitation`);
    expect(event.eventHub.headerImage.url).toBe(`/e/${eventSlug}/artwork/header`); expect(JSON.stringify(event)).not.toContain(path);
  });
});
describe("published guest screens and calendar", () => {
  const event = publicationEvent(eventId, snapshot);
  it("shows a closed message instead of the invitation form without removing the Hub link", () => {
    const html = renderToStaticMarkup(<InvitationPage event={{ ...event, rsvpsOpen: false }} persistenceDisabled={false} />);
    expect(html).toContain("RSVPs are closed"); expect(html).toContain(`href="/e/${eventSlug}/event"`);
    expect(html).not.toContain("<form"); expect(html).not.toContain("Submit RSVP");
  });
  it.each([true, false])("keeps closed private responses readable with calendar only for attending=%s", (attending) => {
    const html = renderToStaticMarkup(<RsvpUpdateForm event={{ ...event, rsvpsOpen: false }} token={"a".repeat(43)} initialRsvp={{ guestName: "Guest", attending, partySize: attending ? 2 : null, displayOnGuestList: false, comment: null }} />);
    expect(html).toContain("RSVPs are closed"); expect(html).toContain("Your saved response"); expect(html).not.toContain("<form");
    expect(html.includes("Add to Calendar")).toBe(attending); expect(html).toContain(`href="/e/${eventSlug}/event"`);
  });
  it("distinguishes unpublished data from a draft and requires review to republish", () => {
    const html = renderToStaticMarkup(<EventPublishReview draft={draft} artwork={{ settings: snapshot.artwork, revision: 0 }} settings={{ settings: snapshot.settings, revision: 3 }} live={{ revision: 5, publishedAt: "2026-10-06", coordinates: null, visibility: "unpublished", rsvpsOpen: false, hasUnpublishedChanges: true }} />);
    expect(html).toContain("Unpublished changes"); expect(html).toContain("Your gathering is private again"); expect(html).toContain("Republish reviewed event");
    expect(html).toContain("RSVPs will remain closed"); expect(html).toContain(`href="/admin/events/${eventId}/guests"`);
    expect(html).not.toContain(`href="/e/${eventSlug}`); expect(html).not.toContain("Your gathering is live");
    expect(html).not.toContain("Confirm: Unpublish");
  });
  it("renders archived review with restore, host access and CSV but no publication controls or public links", () => {
    const html = renderToStaticMarkup(<EventPublishReview draft={draft} artwork={{ settings: snapshot.artwork, revision: 0 }} settings={{ settings: snapshot.settings, revision: 3 }} live={{ revision: 6, publishedAt: "2026-10-06", coordinates: null, visibility: "archived", rsvpsOpen: false, hasUnpublishedChanges: false }} />);
    for (const text of ["Archived", "Restore event", "Everything is saved", "Export all RSVPs", 'href="/admin/events?view=archived"', `href="/admin/events/${eventId}/guests"`]) expect(html).toContain(text);
    for (const text of ["<form", "Reopen RSVPs", "Publish changes", "Republish reviewed event", "Ready to invite", `href="/e/${eventSlug}`, "Confirm: Restore event"]) expect(html).not.toContain(text);
  });
  it("links directly between invitation and Hub without requiring another RSVP", () => {
    const html = renderToStaticMarkup(<InvitationPage event={event} persistenceDisabled={false} />);
    expect(html).toContain(`href="/e/${eventSlug}/event"`); expect(html).toContain("Garden Supper");
    expect(html).not.toMatch(/href="\/event"|oyster-roast|172 Belmont|shuck/i);
  });
  it("applies saved RSVP controls to the private edit form", () => {
    const html = renderToStaticMarkup(<RsvpUpdateForm event={event} token={"a".repeat(64)} initialRsvp={{ guestName: "Guest", attending: true, partySize: 2, displayOnGuestList: false, comment: null }} />);
    expect(html).toContain('value="4"'); expect(html).not.toContain('value="5"'); expect(html).not.toContain("<textarea");
    expect(html).toContain(`href="/e/${eventSlug}/event"`); expect(html).not.toContain('href="/event"');
  });
  it("generates Google, Outlook and ICS links for this event and private edit link", () => {
    const token = "a".repeat(64), edit = getRsvpUpdateUrl(token, event);
    expect(edit).toBe(`https://www.haveashindig.com/e/${eventSlug}/rsvp/${token}`);
    const ics = createOysterRoastIcs(new Date("2026-10-06T12:00:00Z"), edit, event).replace(/\r\n /g, "");
    expect(ics).toContain("DTSTART:20261108T010000Z"); expect(ics).toContain("DTEND:20261108T040000Z");
    expect(ics).toContain(`URL:https://www.haveashindig.com/e/${eventSlug}/event`); expect(ics).toContain(edit);
    expect(ics).not.toContain("Oyster Roast");
    const html = renderToStaticMarkup(<CalendarActions event={event} editToken={token} />);
    expect(html).toContain(`${calendarPath(event)}?token=${token}`); expect(html).toContain("calendar.google.com"); expect(html).toContain("outlook.live.com");
  });
  it("requires explicit confirmation and shows review/share paths without publicizing drafts", () => {
    const props = { draft, artwork: { settings: snapshot.artwork, revision: 0 }, settings: { settings: snapshot.settings, revision: 3 } };
    const html = renderToStaticMarkup(<EventPublishReview {...props} live={null} />);
    expect(html).toMatch(/disabled=""[^>]*>Publish event/); expect(html).toContain("Make this version public");
    expect(html).not.toContain(`href="/e/${eventSlug}`);
    const live = renderToStaticMarkup(<EventPublishReview {...props} live={{ revision: 1, publishedAt: "2026-10-06", coordinates: null, visibility: "published", rsvpsOpen: true, hasUnpublishedChanges: false }} />);
    expect(live).toContain(`href="/e/${eventSlug}"`); expect(live).toContain("Publish changes");
    expect(live).toContain('aria-label="Choose a link to share"'); expect(live).toContain("Get QR code");
  });
});
describe("status labels and saved change detection", () => {
  it("keeps visibility and RSVP admission as independent states", () => {
    expect(eventStatus(null)).toBe("Draft");
    expect(eventStatus({ visibility: "published", rsvpsOpen: true })).toBe("Published");
    expect(eventStatus({ visibility: "published", rsvpsOpen: false })).toBe("Published · RSVPs closed");
    expect(eventStatus({ visibility: "unpublished", rsvpsOpen: true })).toBe("Unpublished");
    expect(eventStatus({ visibility: "archived", rsvpsOpen: false })).toBe("Archived");
  });
  it("offers only restore while archived and archive for published or unpublished gatherings", () => {
    expect(availableLifecycleActions({ visibility: "archived", rsvpsOpen: false })).toEqual(["restore"]);
    expect(availableLifecycleActions({ visibility: "published", rsvpsOpen: true })).toEqual(["close-rsvps", "unpublish", "archive"]);
    expect(availableLifecycleActions({ visibility: "unpublished", rsvpsOpen: false })).toEqual(["reopen-rsvps", "archive"]);
  });
  it("detects saved changes to each independently reviewed part", () => {
    const saved = { details: 2, artwork: 0, settings: 3 };
    expect(hasUnpublishedChanges(saved, saved)).toBe(false);
    for (const key of ["details", "artwork", "settings"] as const) expect(hasUnpublishedChanges({ ...saved, [key]: saved[key] + 1 }, saved)).toBe(true);
  });
});
