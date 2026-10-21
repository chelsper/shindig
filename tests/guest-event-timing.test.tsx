import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { guestEventTiming } from "../lib/guest-event-timing";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { DEFAULT_EVENT_HUB_HEADER } from "../lib/event-hub-settings";
import { EventHubHeader } from "../components/event-hub/event-hub-header";
import { LatestHostNote } from "../components/event-hub/latest-host-note";
import { UpdatesModule } from "../components/event-hub/updates-module";
import { EventModules } from "../components/event-hub/event-modules";
import { DesignedHub, DesignedInvitation } from "../components/event-design/event-presentation";

vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));
vi.mock("../app/event/potluck-actions", () => ({ saveGuestPotluckClaim: vi.fn() }));
vi.mock("../app/event/interaction-actions", () => ({ loadGuestInteractions: vi.fn(), applaudSong: vi.fn(), voteInPoll: vi.fn() }));

const event = OYSTER_ROAST_EVENT;
const near = { nearEvent: true, label: "Today’s the day" };
const ordinary = { nearEvent: false, label: null };
const notes = [
  { heading: "Old note", message: "Old information", publishedAt: "2026-11-01T20:00:00Z" },
  { heading: "Parking", message: "Please park by the garden. <script>not markup</script>", publishedAt: "2026-11-07T20:00:00Z" },
];

describe("event-local returning guest timing", () => {
  it.each([
    ["2026-10-30T16:00:00Z", ordinary], // eight local days, before DST ends
    ["2026-10-31T16:00:00Z", { nearEvent: true, label: "Coming up soon" }],
    ["2026-11-07T02:00:00Z", { nearEvent: true, label: "See you tomorrow" }], // Nov 6 locally
    ["2026-11-07T05:00:00Z", near], // local midnight
    ["2026-11-07T21:59:59Z", near],
    ["2026-11-07T22:00:00Z", { nearEvent: true, label: "Happening now" }],
    ["2026-11-08T01:59:59Z", { nearEvent: true, label: "Happening now" }],
    ["2026-11-08T02:00:00Z", ordinary],
  ])("selects the correct presentation at %s", (now, expected) => {
    expect(guestEventTiming(event, Date.parse(now))).toEqual(expected);
  });
  it("handles overnight events, non-US zones, and DST without assuming 24-hour local days", () => {
    expect(guestEventTiming({ ...event, endsAtUtc: "2026-11-08T08:00:00Z" }, Date.parse("2026-11-08T06:00:00Z")).label).toBe("Happening now");
    expect(guestEventTiming({ ...event, timeZone: "Asia/Tokyo" }, Date.parse("2026-11-07T16:00:00Z"))).toEqual(near);
    expect(guestEventTiming({ ...event, startsAtUtc: "2026-03-08T21:00:00Z", endsAtUtc: "2026-03-09T01:00:00Z" }, Date.parse("2026-03-08T04:30:00Z")).label).toBe("See you tomorrow");
  });
  it("does not make timing claims for invalid dates or zones", () => {
    for (const patch of [{ startsAtUtc: "bad" }, { endsAtUtc: "bad" }, { endsAtUtc: event.startsAtUtc }, { timeZone: "bad/zone" }]) {
      expect(guestEventTiming({ ...event, ...patch }, Date.parse("2026-11-07T20:00:00Z"))).toEqual(ordinary);
    }
    expect(guestEventTiming(event, NaN)).toEqual(ordinary);
  });
});

describe("near-event guest presentation", () => {
  it("brings directions first near the event while retaining canonical details and calendar", () => {
    const html = renderToStaticMarkup(<EventHubHeader event={event} headerSettings={DEFAULT_EVENT_HUB_HEADER} timing={near} />);
    expect(html).toContain("Today’s the day");
    expect(html).toContain(event.timeLabel); expect(html).toContain(event.dateLabel);
    expect(html).toContain(encodeURIComponent(event.address));
    expect(html.indexOf("Get Directions")).toBeLessThan(html.indexOf("Add to Calendar"));
    const far = renderToStaticMarkup(<EventHubHeader event={event} headerSettings={DEFAULT_EVENT_HUB_HEADER} timing={ordinary} />);
    expect(far.indexOf("Add to Calendar")).toBeLessThan(far.indexOf("Get Directions"));
    expect(far).not.toContain("Today’s the day");
  });
  it("surfaces only the newest public host note with escaped text and a working section target", () => {
    const html = renderToStaticMarkup(<LatestHostNote updates={notes} timeZone="America/Los_Angeles" />);
    expect(html).toContain("Parking"); expect(html).not.toContain("Old information");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain('href="#updates"'); expect(html).toContain("12:00 PM");
    expect(renderToStaticMarkup(<LatestHostNote updates={[]} timeZone={event.timeZone} />)).toBe("");
  });
  it("uses the same event-local timestamp in the full updates panel", () => {
    const html = renderToStaticMarkup(<UpdatesModule updates={[notes[1]]} event={{ ...event, slug: "event-test", timeZone: "America/Los_Angeles" }} />);
    expect(html).toContain("12:00 PM"); expect(html).not.toContain("for the roast");
  });
  it("prioritizes weather without duplicating it and keeps all optional activities", () => {
    const html = renderToStaticMarkup(<EventModules event={event} timing={near} features={event.features} guestList={null} updates={notes} />);
    expect(html.indexOf('id="hub-tab-weather"')).toBeLessThan(html.indexOf('id="hub-tab-playlist"'));
    expect(html).not.toContain('hidden="" id="hub-panel-weather"');
    expect(html).toContain('hidden="" id="hub-panel-playlist"');
    expect(html.match(/id="hub-panel-weather"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Latest host note"');
    expect(html).toContain("Good to know before you go");
  });
  it("never highlights disabled/unavailable updates or fabricates weather", () => {
    const hidden = renderToStaticMarkup(<EventModules event={event} timing={near} features={{ ...event.features, weather: false, updates: false }} guestList={null} updates={notes} />);
    expect(hidden).not.toContain("Parking"); expect(hidden).not.toContain("Weather");
    expect(hidden).toContain('id="hub-tab-playlist"');
    const unavailable = renderToStaticMarkup(<EventModules event={event} timing={near} features={event.features} guestList={null} updates={notes} updatesUnavailable />);
    expect(unavailable).not.toContain('aria-label="Latest host note"');
    expect(unavailable).not.toContain("Parking");
    expect(unavailable).toContain("Checking the skies");
    expect(unavailable).not.toContain("°");
    const far = renderToStaticMarkup(<EventModules event={event} timing={ordinary} features={event.features} guestList={null} updates={notes} />);
    expect(far).not.toContain('aria-label="Latest host note"');
    expect(far).toContain('hidden="" id="hub-panel-weather"');
  });
  it.each([DesignedHub, DesignedInvitation])("puts returning tools before artwork without adding them to host previews", Component => {
    const props = { appearance: { style: "coastal" as const, invitationCrop: { x: 50, y: 50, zoom: 100 } }, details: { title: "Test gathering", eyebrow: "Welcome", date: "Saturday", time: "5 PM", venue: "Garden", address: "Test address", description: "Hello" }, image: { url: "/art.png", alt: "Test artwork", crop: { x: 50, y: 50, zoom: 100 } }, guestTools: <p>Saved shortcut marker</p> };
    const html = renderToStaticMarkup(<Component {...props} />);
    expect(html.indexOf("Saved shortcut marker")).toBeLessThan(html.indexOf('alt="Test artwork"'));
    expect(renderToStaticMarkup(<Component {...props} preview />)).not.toContain("Saved shortcut marker");
  });
});
