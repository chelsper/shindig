import { describe, expect, it } from "vitest";

import {
  createOysterRoastIcs,
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
  it("generates a standards-shaped ICS file with UTC times and the private RSVP link", () => {
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
    expect(unfolded).toContain(`URL:${rsvpUrl}\r\n`);
    expect(unfolded).toContain(
      `View event or update your RSVP: ${rsvpUrl}`,
    );

    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
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
    expect(url.searchParams.get("details")).toContain(rsvpUrl);
  });

  it("builds a prefilled Outlook event from the canonical details", () => {
    const url = new URL(getOutlookCalendarUrl(rsvpUrl));

    expect(url.origin).toBe("https://outlook.live.com");
    expect(url.searchParams.get("rru")).toBe("addevent");
    expect(url.searchParams.get("subject")).toBe(OYSTER_ROAST_EVENT.title);
    expect(url.searchParams.get("startdt")).toBe("2026-11-07T22:00:00Z");
    expect(url.searchParams.get("enddt")).toBe("2026-11-08T02:00:00Z");
    expect(url.searchParams.get("location")).toBe(OYSTER_ROAST_EVENT.address);
    expect(url.searchParams.get("body")).toContain(rsvpUrl);
  });
});
