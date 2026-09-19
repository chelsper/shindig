import { describe, expect, it } from "vitest";

import { GET } from "../app/calendar/oyster-roast.ics/route";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

describe("dynamic ICS route", () => {
  it("downloads a calendar file containing a valid guest update link", async () => {
    const editToken = "A".repeat(43);
    const response = GET(
      new Request(
        `https://www.haveashindig.com/calendar/oyster-roast.ics?token=${editToken}`,
      ),
    );
    const ics = (await response.text()).replaceAll("\r\n ", "");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toContain(
      OYSTER_ROAST_EVENT.calendarFilename,
    );
    expect(ics).toContain(
      `https://www.haveashindig.com/rsvp/${editToken}`,
    );
    expect(ics).toContain("URL:https://www.haveashindig.com/event\r\n");
  });

  it("ignores malformed tokens and links only to the public event", async () => {
    const response = GET(
      new Request(
        "https://www.haveashindig.com/calendar/oyster-roast.ics?token=guessable",
      ),
    );
    const ics = (await response.text()).replaceAll("\r\n ", "");

    expect(ics).toContain("URL:https://www.haveashindig.com/event\r\n");
    expect(ics).not.toContain("/rsvp/guessable");
  });
});
