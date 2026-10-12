import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventHostingOverview } from "../components/admin/event-hosting-overview";
import { hostingRsvpStatus, hostingSectionStatus, type HostingOverview, type HostingPublication } from "../lib/hosting-overview";
import { hosting, hostingPublication as publication } from "./fixtures/hosting-overview";
import { eventId } from "./fixtures/publication";
const props = { id: eventId, data: hosting, publication, features: publication.features };
const base = `/admin/events/${eventId}`;
const empty: HostingOverview = { ...hosting, rsvps: { totalAttending: 0, totalResponses: 0, declined: 0, totalPartySize: 0 }, potluck: { items: 0, needed: 0, covered: 0, remaining: 0, uncoveredItems: 0 }, questions: { total: 0, unanswered: 0, answeredPrivate: 0, approved: 0 }, playlist: { total: 0 }, polls: { total: 0, open: 0, drafts: 0, closed: 0 }, updates: { total: 0 } };

describe("hosting overview presentation", () => {
  it("distinguishes people from responses and surfaces useful follow-ups with scoped links", () => {
    const html = renderToStaticMarkup(<EventHostingOverview {...props} />);
    for (const text of ["Hosting at a glance", "Guests attending", ">24<", "RSVP responses", ">10<", "Attending households", "Declined responses", "names are hidden", "2 questions waiting", "3 still needed across 2 requests", "6 song suggestions", "1 open poll", "2 host notes"]) expect(html).toContain(text);
    for (const target of ["guests", "publish", "content?view=questions", "content?view=potluck", "guests?view=playlist", "content?view=polls", "content?view=updates"]) expect(html).toContain(`href="${base}/${target}"`);
    expect(html).not.toMatch(/<form|<button|\/api\/|DATABASE_URL|ADMIN_PASSWORD/);
    expect(html).toContain("More Hub activity"); expect(html).toContain("min-h-11"); expect(html).toContain("grid-cols-2");
  });
  it("uses published capacity and event-local deadline, not the viewer's timezone", () => {
    const html = renderToStaticMarkup(<EventHostingOverview {...props} />);
    expect(html).toContain("6 of 30 guest places remaining");
    expect(html).toContain("Nov 7, 2026, 5:00 PM EST"); expect(html).not.toContain("10:00 PM");
    expect(html).toContain("last published RSVP rules"); expect(html).toContain("Guest RSVPs open");
  });
  it("keeps new drafts private, without links to unavailable guest management", () => {
    const html = renderToStaticMarkup(<EventHostingOverview {...props} publication={null} data={empty} />);
    expect(html).toContain("Not published yet"); expect(html).toContain("after the first publication"); expect(html).toContain("Saved privately");
    expect(html).not.toContain(`href="${base}/guests`); expect(html).not.toContain("Guest RSVPs open"); expect(html).not.toContain("All open requests are covered");
    expect(html).toContain("No open requests yet"); expect(html).toContain("No questions yet");
  });
  it("does not mistake saved off switches for the live feature state", () => {
    const features = { ...props.features, questions: false, potluck: false };
    let html = renderToStaticMarkup(<EventHostingOverview {...props} features={features} />);
    expect(html).toContain("Live · off after publishing"); expect(html).toContain("2 questions waiting");
    html = renderToStaticMarkup(<EventHostingOverview {...props} features={features} publication={{ ...publication, features }} />);
    expect(html).toContain("Off · saved activity retained"); expect(html).toContain("2 questions waiting");
  });
  it("omits unused disabled sections but retains their saved activity for the host", () => {
    const features = { ...props.features, questions: false, potluck: false, playlist: false, polls: false, updates: false };
    const html = renderToStaticMarkup(<EventHostingOverview {...props} features={features} publication={{ ...publication, features }} data={empty} />);
    expect(html).not.toMatch(/Ask the Host|Bring something|Playlist|Polls|Host Updates|Hub activity/);
  });
  it.each(["archived", "unpublished"] as const)("retains totals while marking %s guest links unavailable", visibility => {
    const html = renderToStaticMarkup(<EventHostingOverview {...props} publication={{ ...publication, visibility }} />);
    expect(html).toContain(`Event ${visibility}`); expect(html).toContain("Guest links are unavailable"); expect(html).toContain(">24<"); expect(html).not.toContain(">Live<");
    expect(html).toContain(`href="${base}/guests"`); expect(html).not.toContain('href="/e/');
  });
  it("shows unavailable counts honestly without hiding the rest of the overview", () => {
    const html = renderToStaticMarkup(<EventHostingOverview {...props} data={{ ...hosting, rsvps: null, questions: null, potluck: null }} />);
    expect(html).toContain("Attendance totals couldn’t load"); expect(html).toContain("Capacity check unavailable"); expect(html).toContain("Question totals unavailable"); expect(html).toContain("Signup totals unavailable");
    expect(html).not.toContain("guest places remaining"); expect(html).not.toContain("No questions yet"); expect(html).not.toContain("No open requests yet");
    expect(html).toContain("6 song suggestions"); expect(html).toContain("Some activity couldn’t be checked");
    expect(renderToStaticMarkup(<EventHostingOverview {...props} data={null} />)).toContain("Activity couldn’t load");
  });
  it("calls covered requests complete only when an open request actually exists", () => {
    const html = renderToStaticMarkup(<EventHostingOverview {...props} data={{ ...hosting, potluck: { items: 1, needed: 3, covered: 3, remaining: 0, uncoveredItems: 0 } }} />);
    expect(html).toContain("All open requests are covered"); expect(html).toContain("3 of 3 requested quantities");
  });
});

describe("hosting status rules", () => {
  it.each([
    [null, "Not published yet"],
    [{ ...publication, visibility: "archived" }, "Event archived"],
    [{ ...publication, visibility: "unpublished" }, "Event unpublished"],
    [{ ...publication, rsvpsOpen: false }, "Guest RSVPs paused"],
    [{ ...publication, rsvp: { deadlineAtUtc: "2026-10-01T22:00:00.000Z" } }, "RSVP deadline passed"],
    [{ ...publication, rsvp: { capacity: 24 } }, "Guest capacity reached"],
    [publication, "Guest RSVPs open"],
  ] satisfies [HostingPublication | null, string][])("reflects published availability: %s", (value, text) => {
    expect(hostingRsvpStatus(value, hosting.rsvps, hosting.checkedAt)).toBe(text);
  });
  it("does not call a capacity-limited event open without a successful attendance read", () => {
    expect(hostingRsvpStatus(publication, null, hosting.checkedAt)).toBe("Capacity check unavailable");
    expect(hostingRsvpStatus({ ...publication, rsvpsOpen: false }, null, hosting.checkedAt)).toBe("Guest RSVPs paused");
  });
  it("distinguishes private prepared content, retained disabled content and live sections", () => {
    expect(hostingSectionStatus("questions", props.features, null)).toBe("Saved privately");
    expect(hostingSectionStatus("questions", props.features, publication)).toBe("Live");
    expect(hostingSectionStatus("questions", { ...props.features, questions: false }, null)).toBe("Off · saved activity retained");
  });
});
