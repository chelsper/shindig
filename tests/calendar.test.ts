import { describe, expect, it } from "vitest";

import {
  createOysterRoastIcs,
  getEventHubUrl,
  getGoogleCalendarUrl,
  getOutlookCalendarUrl,
  getRsvpUpdateUrl,
} from "../lib/calendar";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

const editToken = "A".repeat(43);
const rsvpUrl = getRsvpUpdateUrl(editToken);

function unfoldIcs(value: string) {
  return value.replaceAll("\r\n ", "");
}

describe("Oyster Roast calendar support", () => {
  it("generates an ICS file pointing to the Hub while preserving the private RSVP link", () => {
    const ics = createOysterRoastIcs(
      new Date("2026-09-19T15:30:45.000Z"),
      rsvpUrl,
    );
    const unfolded = unfoldIcs(ics);

    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
    expect(ics.replaceAll("\r\n", "")).not.toContain("\n");
    expect(unfolded).toContain("VERSION:2.0\r\n");
    expect(unfolded).toContain("METHOD:PUBLISH\r\n");
    expect(unfolded).toContain("DTSTAMP:20260919T153045Z\r\n");
    expect(unfolded).toContain("DTSTART:20261107T220000Z\r\n");
    expect(unfolded).toContain("DTEND:20261108T020000Z\r\n");
    expect(unfolded).toContain(`SUMMARY:${OYSTER_ROAST_EVENT.title}\r\n`);
    expect(unfolded).toContain(
      "LOCATION:172 Belmont Dr\\, St. Johns\\, FL 32259\r\n",
    );
    expect(unfolded).toContain("URL:https://www.haveashindig.com/event\r\n");
    expect(unfolded).toContain("View Event Hub: https://www.haveashindig.com/event");
    expect(unfolded).toContain(
      `Update your RSVP (private link): ${rsvpUrl}`,
    );

    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("links public calendar entries to the Hub without including a private RSVP link", () => {
    expect(getEventHubUrl()).toBe("https://www.haveashindig.com/event");
    const ics = unfoldIcs(createOysterRoastIcs());
    const google = new URL(getGoogleCalendarUrl()).searchParams.get("details");
    const outlook = new URL(getOutlookCalendarUrl()).searchParams.get("body");

    for (const description of [ics, google, outlook]) {
      expect(description).toContain("View Event Hub: https://www.haveashindig.com/event");
      expect(description).not.toContain("/rsvp/");
      expect(description).not.toContain("private link");
    }
    expect(ics).toContain("URL:https://www.haveashindig.com/event\r\n");
  });

  it("builds a prefilled Google Calendar event from the canonical details", () => {
    const url = new URL(getGoogleCalendarUrl(rsvpUrl));

    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(OYSTER_ROAST_EVENT.title);
    expect(url.searchParams.get("dates")).toBe(
      "20261107T220000Z/20261108T020000Z",
    );
    expect(url.searchParams.get("location")).toBe(OYSTER_ROAST_EVENT.address);
    expect(url.searchParams.get("details")).toContain("View Event Hub: https://www.haveashindig.com/event");
    expect(url.searchParams.get("details")).toContain(`Update your RSVP (private link): ${rsvpUrl}`);
  });

  it("builds a prefilled Outlook event from the canonical details", () => {
    const url = new URL(getOutlookCalendarUrl(rsvpUrl));

    expect(url.origin).toBe("https://outlook.live.com");
    expect(url.searchParams.get("rru")).toBe("addevent");
    expect(url.searchParams.get("subject")).toBe(OYSTER_ROAST_EVENT.title);
    expect(url.searchParams.get("startdt")).toBe("2026-11-07T22:00:00Z");
    expect(url.searchParams.get("enddt")).toBe("2026-11-08T02:00:00Z");
    expect(url.searchParams.get("location")).toBe(OYSTER_ROAST_EVENT.address);
    expect(url.searchParams.get("body")).toContain("View Event Hub: https://www.haveashindig.com/event");
    expect(url.searchParams.get("body")).toContain(`Update your RSVP (private link): ${rsvpUrl}`);
  });
});
