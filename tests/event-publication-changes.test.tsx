import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../app/admin/events/[id]/publish/actions", () => ({ publishEvent: vi.fn(), changeEventLifecycle: vi.fn(), checkEventLink: vi.fn() }));
import { compareEventPublication } from "../lib/event-publication-changes";
import type { PublicationSnapshot } from "../lib/event-publication";
import { draftImageUrl } from "../lib/event-draft-artwork";
import { DRAFT_HUB_MODULES } from "../lib/event-draft-settings";
import { PublicationChangeReview } from "../components/admin/publication-change-review";
import { EventPublishReview } from "../components/admin/event-publish-review";
import { draft, snapshot, eventId, otherEventId, publication } from "./fixtures/publication";

const compare = (after: PublicationSnapshot, before = snapshot) => compareEventPublication(eventId, before, after);
const rows = (review: ReturnType<typeof compare>) => review.groups.flatMap(({ changes }) => changes);
const changed = { ...snapshot, details: { ...draft, title: "An evening in the garden" } };
const path = (role: string, version = otherEventId) => `event-drafts/${eventId}/${role}/${version}.png`;
const artSnapshot: PublicationSnapshot = { ...snapshot, artwork: {
  ...snapshot.artwork, invitation: { path: path("invitation"), alt: "Garden table" },
  design: { style: "coastal", invitationCrop: { x: 30, y: 65, zoom: 150 } },
} };

describe("whitelisted live-versus-draft comparison", () => {
  it("is empty for matching content and never mutates either snapshot", () => {
    const before = JSON.stringify(snapshot);
    expect(compare(structuredClone(snapshot))).toEqual({ groups: [], changeCount: 0, calendarChanged: false });
    compare(changed);
    expect(JSON.stringify(snapshot)).toBe(before); expect(changed.details.title).toBe("An evening in the garden");
  });
  it("ignores revisions, read metadata, coordinate match metadata and property order", () => {
    const details = { ...draft, revision: 100, updatedAt: "2099-01-01", location: { latitude: 1, longitude: 2, address: draft.address, matchedAddress: "SECRET MATCH", source: "manual" as const } };
    const reordered = { ...snapshot, details, settings: { features: { ...snapshot.settings.features }, rsvp: { ...snapshot.settings.rsvp, capacity: null, deadlineAtUtc: null } } };
    expect(compare(reordered).changeCount).toBe(0);
    expect(compare({ ...snapshot, coordinates: { latitude: 1, longitude: 2 } }).changeCount).toBe(0); // Weather off.
  });
  it("normalizes legacy optional limits and does not compare whole JSON objects", () => {
    expect(compare({ ...snapshot, settings: { rsvp: { capacity: null, deadlineAtUtc: null, guestListDefaultVisible: false, allowComments: false, maxPartySize: 4 }, features: { ...snapshot.settings.features } } }).changeCount).toBe(0);
  });
  it("shows only changed wording and treats an empty saved value as an explicit removal", () => {
    const review = compare({ ...changed, details: { ...changed.details, hostName: "", description: "Bring a friend.\nStay awhile." } });
    expect(review.changeCount).toBe(3); expect(review.groups.map(({ id }) => id)).toEqual(["invitation"]);
    expect(rows(review)).toMatchObject([
      { id: "title", before: { text: "Garden Supper" }, after: { text: "An evening in the garden" } },
      { id: "hostName", before: { text: "Test Host" }, after: { text: "Not set" } },
      { id: "description", after: { text: "Bring a friend.\nStay awhile." } },
    ]);
    expect(review.calendarChanged).toBe(true);
  });
  it("formats each side in its own timezone, including DST, never the host browser timezone", () => {
    const before = { ...snapshot, details: { ...draft, timeZone: "America/New_York", startsAtUtc: "2026-10-09T21:00:00.000Z" } };
    const after = { ...snapshot, details: { ...draft, timeZone: "America/New_York", startsAtUtc: "2026-11-07T22:00:00.000Z" } };
    const start = rows(compare(after, before)).find(({ id }) => id === "startsAtUtc")!;
    expect(start.before.text).toContain("5:00 PM EDT"); expect(start.after.text).toContain("5:00 PM EST");
    const zoneOnly = rows(compare({ ...snapshot, details: { ...draft, timeZone: "America/New_York" } }));
    expect(zoneOnly.map(({ id }) => id)).toEqual(["startsAtUtc", "endsAtUtc", "timeZone"]);
    expect(zoneOnly[0].before.text).toContain("5:00 PM PST"); expect(zoneOnly[0].after.text).toContain("8:00 PM EST");
  });
  it("handles incomplete saved dates without suppressing the review", () => {
    const review = compare({ ...snapshot, details: { ...draft, startsAtUtc: null, endsAtUtc: null } });
    expect(rows(review).map(({ after }) => after.text)).toEqual(["Not set", "Not set"]);
    expect(review.calendarChanged).toBe(true);
  });
  it("shows address and weather confirmation changes without provider/private metadata", () => {
    const before = { ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, weather: true } }, coordinates: { latitude: 30, longitude: -81 } };
    const after = { ...before, details: { ...draft, address: "456 New Lane", venue: "The yard", cityLabel: "New City" }, coordinates: null };
    const review = compare(after, before);
    expect(review.groups.map(({ id }) => id)).toEqual(["where"]);
    expect(rows(review).find(({ id }) => id === "coordinates")).toMatchObject({ before: { text: "30, -81" }, after: { text: "Location confirmation needed" }, editHref: `/admin/events/${eventId}/location` });
    expect(review.calendarChanged).toBe(true);
  });
  it("covers every RSVP rule with clear limit removals and guest privacy semantics", () => {
    const after = { ...snapshot, settings: { ...snapshot.settings, rsvp: { maxPartySize: 8, allowComments: true, guestListDefaultVisible: true, capacity: 40, deadlineAtUtc: "2026-11-07T23:00:00.000Z" } } };
    const review = compare(after);
    expect(review.changeCount).toBe(5); expect(review.calendarChanged).toBe(false);
    expect(rows(review).map(({ id }) => id)).toEqual(["partySize", "comments", "guestNames", "deadline", "capacity"]);
    expect(rows(review)[2].note).toContain("existing visibility preferences are not changed");
    expect(rows(review)[3].after.text).toContain("3:00 PM PST");
    const removed = rows(compare(snapshot, after));
    expect(removed[3].after.text).toBe("No deadline"); expect(removed[4].after.text).toBe("No attendance limit");
  });
  it.each(DRAFT_HUB_MODULES)("compares the canonical $label flag independently", ({ id }) => {
    const review = compare({ ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, [id]: !snapshot.settings.features[id] } } });
    const hub = review.groups.find(({ id }) => id === "hub")!;
    expect(hub.changes).toHaveLength(1); expect(hub.changes[0].id).toBe(id);
    expect(hub.editHref).toBe(`/admin/events/${eventId}/settings#hub-settings-heading`);
  });
  it("shows artwork replacement with private same-event image URLs and Hub fallback", () => {
    const nextPath = path("invitation", eventId);
    const review = compare({ ...artSnapshot, artwork: { ...artSnapshot.artwork, invitation: { path: nextPath, alt: "New table" } } }, artSnapshot);
    const image = rows(review).find(({ id }) => id === "invitationImage")!;
    expect(image.before.image?.src).toBe(draftImageUrl(eventId, path("invitation")));
    expect(image.after.image?.src).toBe(draftImageUrl(eventId, nextPath));
    expect(rows(review).find(({ id }) => id === "headerImage")?.after.text).toBe("Uses invitation artwork");
    expect(rows(review).find(({ id }) => id === "headerAlt")?.after.text).toBe("New table");
    expect(review.calendarChanged).toBe(false);
  });
  it("reports separate Hub artwork, style, and framing independently", () => {
    const after = { ...artSnapshot, artwork: { ...artSnapshot.artwork, design: { style: "after-dark" as const, invitationCrop: { x: 50, y: 75, zoom: 170 } }, header: { path: path("header"), alt: "Separate header", focalX: 15, focalY: 25, zoomPercent: 120 } } };
    const review = compare(after, artSnapshot);
    expect(rows(review).map(({ id }) => id)).toEqual(["style", "headerImage", "headerAlt", "invitationCrop", "headerCrop"]);
    expect(rows(review)[0]).toMatchObject({ before: { text: "Coastal" }, after: { text: "After Dark" } });
    expect(rows(review)[3].after.text).toBe("Horizontal 50% · Vertical 75% · Zoom 170%");
  });
  it("reports artwork removal and original layout without inventing thumbnails", () => {
    const review = compare(snapshot, artSnapshot);
    expect(rows(review).find(({ id }) => id === "style")?.after.text).toBe("Original layout");
    expect(rows(review).find(({ id }) => id === "invitationImage")?.after).toEqual({ text: "Text-only invitation" });
    expect(rows(review).find(({ id }) => id === "headerImage")?.after).toEqual({ text: "No Hub artwork" });
  });
  it("ignores framing that cannot affect absent artwork", () => {
    const before = { ...snapshot, artwork: { ...snapshot.artwork, design: { style: "coastal" as const, invitationCrop: { x: 50, y: 50, zoom: 100 } } } };
    expect(compare({ ...before, artwork: { ...before.artwork, design: { ...before.artwork.design, invitationCrop: { x: 70, y: 80, zoom: 200 } }, header: { ...before.artwork.header, focalX: 15, zoomPercent: 150 } } }, before).changeCount).toBe(0);
  });
  it("rejects foreign/unsafe image paths and invalid event IDs", () => {
    for (const foreign of [path("invitation").replace(eventId, otherEventId), "https://evil.test/image", "../private.png"]) {
      expect(() => compare({ ...artSnapshot, artwork: { ...artSnapshot.artwork, invitation: { path: foreign, alt: "bad" } } })).toThrow("Invalid comparison artwork");
    }
    expect(() => compareEventPublication("../admin", snapshot, snapshot)).toThrow("Invalid event comparison");
  });
  it("projects no guest data, database metadata or storage credentials", () => {
    const extra = { ...changed, secret: "private-storage-token", guest: { comment: "PRIVATE COMMENT", name: "PRIVATE GUEST" }, details: { ...changed.details, location: { matchedAddress: "SECRET MATCH" } } };
    const serialized = JSON.stringify(compare(extra));
    for (const text of ["PRIVATE", "SECRET", "private-storage-token", "updatedAt", "revision", "snapshot"]) expect(serialized).not.toContain(text);
  });
});

describe("publish change review presentation and safeguards", () => {
  const review = compare(changed);
  const props = { id: eventId, review, visibility: "published" as const };
  it("has a distinct first-publication state without claiming content is already live", () => {
    const html = renderToStaticMarkup(<PublicationChangeReview {...props} review={null} visibility={null} />);
    expect(html).toContain("Your first invitation"); expect(html).toContain("has not been published");
    expect(html).not.toContain("Live now"); expect(html).not.toContain("Comparison unavailable");
  });
  it("shows only changed groups, readable before/after values, edit links and private previews", () => {
    const html = renderToStaticMarkup(<PublicationChangeReview {...props} />);
    for (const text of ["Review your changes", "1 change", "Live now", "After publishing", "Garden Supper", "An evening in the garden", "Calendar details are changing", "No notifications"]) expect(html).toContain(text);
    expect(html).toContain("<details open"); expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain(`href="/admin/events/${eventId}#draft-basics-heading"`);
    expect(html).toContain(`href="/admin/events/${eventId}/preview?view=hub"`);
    expect(html).not.toContain("RSVP rules"); expect(html).not.toContain('href="/e/');
  });
  it("makes unchanged resaves explicit instead of reporting fake changes", () => {
    const html = renderToStaticMarkup(<PublicationChangeReview {...props} review={compare(snapshot)} savedAgain />);
    expect(html).toContain("No content changes"); expect(html).toContain("saved again"); expect(html).not.toContain("<details"); expect(html).not.toContain("Calendar details");
  });
  it.each(["unpublished", "archived"] as const)("labels historical snapshots, not live pages, while %s", (visibility) => {
    const html = renderToStaticMarkup(<PublicationChangeReview {...props} visibility={visibility} />);
    expect(html).toContain("Last published"); expect(html).not.toContain("Live now"); expect(html).not.toContain("Guests still see");
    expect(html).toContain(visibility === "archived" ? "Restore it privately" : "private again");
  });
  it("escapes host text and shows uncropped private artwork without unsafe HTML", () => {
    const review = compare({ ...artSnapshot, details: { ...draft, description: '<script>alert("x")</script>' } });
    const html = renderToStaticMarkup(<PublicationChangeReview {...props} review={review} />);
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("object-contain");
    expect(html).toContain("/artwork/image?path="); expect(html).not.toContain("blob.vercel");
  });
  it("blocks publication if an existing event comparison is unavailable", () => {
    const html = renderToStaticMarkup(<EventPublishReview changeReview={null} draft={draft} artwork={{ settings: snapshot.artwork, revision: 0 }} settings={{ settings: snapshot.settings, revision: 3 }} live={{ ...publication, coordinates: null, hasUnpublishedChanges: true }} />);
    expect(html).toContain("Comparison unavailable"); expect(html).toMatch(/disabled=""[^>]*>Finish setup to publish/);
    expect(html).not.toContain("Your first invitation");
  });
  it("keeps publication explicitly unconfirmed after reviewing changes and preserves closed RSVPs", () => {
    const html = renderToStaticMarkup(<EventPublishReview changeReview={review} draft={changed.details} artwork={{ settings: snapshot.artwork, revision: 0 }} settings={{ settings: snapshot.settings, revision: 3 }} live={{ ...publication, coordinates: null, hasUnpublishedChanges: true, rsvpsOpen: false }} />);
    expect(html).toContain("I reviewed the changes above"); expect(html).toMatch(/disabled=""[^>]*>Publish changes/);
    expect(html).not.toContain('checked=""'); expect(html).toContain("RSVPs will remain closed");
    expect(html.indexOf("Review your changes")).toBeLessThan(html.indexOf("Ready to invite your people?"));
  });
});
