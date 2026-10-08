import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventSetupOverview, type SetupPublication } from "../components/admin/event-setup-overview";
import { EventSetupNavigation } from "../components/admin/event-setup-navigation";
import { publicationIssues, savedWeatherCoordinates } from "../lib/event-readiness";
import { publicationProblems } from "../lib/event-publication";
import { draftReadiness } from "../lib/event-draft-settings";
import { draft, snapshot, eventId as id } from "./fixtures/publication";

const artwork = { settings: snapshot.artwork, revision: 0 };
const settings = { settings: snapshot.settings, revision: 3 };
const base = `/admin/events/${id}`;
const props = { draft, artwork, settings, coordinates: null, live: null };
const weather = { ...snapshot.settings, features: { ...snapshot.settings.features, weather: true } };

describe("guided event readiness", () => {
  it("uses the same required problems in the guide, settings and publication parser", () => {
    const details = { ...draft, startsAtUtc: null, endsAtUtc: null, address: " " };
    const incomplete = { ...snapshot, details, settings: weather };
    const issues = publicationIssues(incomplete);
    expect(issues.map(({ id }) => id)).toEqual(["date", "end", "location", "weather"]);
    expect(issues.map(({ message }) => message)).toEqual(publicationProblems(incomplete));
    const checklist = draftReadiness(details, artwork.settings, weather, true);
    expect(checklist.filter((item) => item.required && !item.complete).map(({ id }) => id).sort()).toEqual(issues.map(({ id }) => id).sort());
    const html = renderToStaticMarkup(<EventSetupOverview {...props} draft={details} settings={{ settings: weather, revision: 3 }} />);
    expect(html).toContain("4 details to finish");
    for (const issue of issues) { expect(html).toContain(issue.message); expect(html).toContain(`href="${base}${issue.destination}"`); }
  });
  it("allows text-only invitations, optional descriptions and no Hub modules", () => {
    const minimal = { ...draft, description: "", hostName: "", venue: "", cityLabel: "" };
    const config = { ...snapshot.settings, features: { guestList: false, playlist: false, questions: false, weather: false, updates: false, polls: false, photos: false, potluck: false } };
    expect(publicationProblems({ ...snapshot, details: minimal, settings: config })).toEqual([]);
    const html = renderToStaticMarkup(<EventSetupOverview {...props} draft={minimal} settings={{ settings: config, revision: 1 }} />);
    expect(html).toContain("Ready for your final review"); expect(html).toContain("Optional");
    expect(html).toContain("Images aren’t required"); expect(html).toContain("event details only");
    expect(html).not.toContain("Needs attention");
  });
  it("requires suggested RSVP defaults to be saved, and points to that editor", () => {
    const html = renderToStaticMarkup(<EventSetupOverview {...props} settings={{ ...settings, revision: 0 }} justSaved />);
    expect(html).toContain("1 detail to finish"); expect(html).toContain("Save your RSVP &amp; Hub choices.");
    expect(html).toContain(`href="${base}/settings"`); expect(html).toContain("Draft saved privately");
    expect(html).not.toContain("Ready for your final review");
  });
  it("marks saved optional artwork ready without exposing a private storage URL", () => {
    const art = { ...snapshot.artwork, header: { ...snapshot.artwork.header, path: "private-do-not-expose", alt: "A garden" } };
    const html = renderToStaticMarkup(<EventSetupOverview {...props} artwork={{ settings: art, revision: 1 }} />);
    expect(html).toContain("Review artwork"); expect(html).not.toContain("private-do-not-expose");
    expect(html).not.toContain("Optional");
  });
  it("reuses confirmed coordinates only when the saved address matches", () => {
    const coordinates = { latitude: 30.1, longitude: -81.6 };
    const published = { ...snapshot, coordinates, settings: weather };
    expect(savedWeatherCoordinates(draft, null)).toBeNull();
    expect(savedWeatherCoordinates(draft, published)).toEqual(coordinates);
    expect(savedWeatherCoordinates({ ...draft, address: ` ${draft.address} ` }, published)).toEqual(coordinates);
    expect(savedWeatherCoordinates({ ...draft, address: "456 A Different Street" }, published)).toBeNull();
    expect(draftReadiness(draft, artwork.settings, weather, true, coordinates).find(({ id }) => id === "weather")?.complete).toBe(true);
    expect(renderToStaticMarkup(<EventSetupOverview {...props} coordinates={coordinates} settings={{ settings: weather, revision: 3 }} />)).not.toContain("Needs attention");
  });
});

describe("private setup navigation and publication states", () => {
  it.each(["setup", "details", "artwork", "settings", "preview", "publish"] as const)("uses the same event-scoped navigation on %s", (current) => {
    const html = renderToStaticMarkup(<EventSetupNavigation id={id} current={current} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(links).toEqual([`${base}/setup`, base, `${base}/artwork`, `${base}/settings`, `${base}/preview`, `${base}/publish`]);
    expect(html).toContain("min-h-11"); expect(html).toContain("flex-wrap");
  });
  it.each([null, { visibility: "unpublished", rsvpsOpen: false, hasUnpublishedChanges: true }, { visibility: "archived", rsvpsOpen: false, hasUnpublishedChanges: true }] satisfies (SetupPublication | null)[])("never offers public links or QR downloads for private events: %j", (live) => {
    const html = renderToStaticMarkup(<EventSetupOverview {...props} live={live} />);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.every((href) => href.startsWith(base) || href === `/admin/events/duplicate/${id}`)).toBe(true);
    expect(html).not.toContain("#share-event"); expect(html).not.toContain("Get links &amp; QR codes");
    expect(html).not.toContain("<form"); expect(html).not.toContain("<img");
  });
  it("distinguishes saved private changes from the existing live guest pages", () => {
    const live: SetupPublication = { visibility: "published", rsvpsOpen: true, hasUnpublishedChanges: true };
    let html = renderToStaticMarkup(<EventSetupOverview {...props} live={live} />);
    expect(html).toContain("Unpublished changes"); expect(html).toContain("last published version"); expect(html).toContain("Ready for your final review");
    expect(html).toContain(`${base}/publish#share-event`); expect(html).toContain(`${base}/guests`);
    html = renderToStaticMarkup(<EventSetupOverview {...props} live={{ ...live, hasUnpublishedChanges: false, rsvpsOpen: false }} />);
    expect(html).toContain("Published · RSVPs closed"); expect(html).toContain("All set for your gathering");
    expect(html).toContain("Share your event"); expect(html).toContain("matches the live version");
  });
  it("keeps archived events private, with a restoration path and retained data", () => {
    const html = renderToStaticMarkup(<EventSetupOverview {...props} live={{ visibility: "archived", rsvpsOpen: false, hasUnpublishedChanges: true }} />);
    expect(html).toContain("Restore event"); expect(html).toContain("Manage saved guests");
    expect(html).toContain("restoring does not publish it");
    expect(html).not.toContain("Ready for your final review"); expect(html).not.toContain("Continue setup");
  });
  it("escapes user-provided titles and does not borrow Oyster Roast content", () => {
    const html = renderToStaticMarkup(<EventSetupOverview {...props} draft={{ ...draft, title: "<script>secret</script>" }} />);
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/172 Belmont|Oyster Roast|DATABASE_URL|ADMIN_PASSWORD/);
  });
});
