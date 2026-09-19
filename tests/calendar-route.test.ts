import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: vi.fn() }));
import { getEventConfiguration } from "../lib/server/invitation-settings";

import { GET } from "../app/calendar/oyster-roast.ics/route";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

describe("dynamic ICS route", () => {
  beforeEach(() => { vi.mocked(getEventConfiguration).mockResolvedValue(OYSTER_ROAST_EVENT); });
  it("downloads a calendar file containing a valid guest update link", async () => {
    const editToken = "A".repeat(43);
    const response = await GET(
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
    const response = await GET(
      new Request(
        "https://www.haveashindig.com/calendar/oyster-roast.ics?token=guessable",
      ),
    );
    const ics = (await response.text()).replaceAll("\r\n ", "");

    expect(ics).toContain("URL:https://www.haveashindig.com/event\r\n");
    expect(ics).not.toContain("/rsvp/guessable");
  });

  it("uses newly published details and never caches private edit links", async () => {
    vi.mocked(getEventConfiguration).mockResolvedValue({ ...OYSTER_ROAST_EVENT, title: "Updated roast", startsAtUtc: "2026-11-07T23:00:00.000Z", address: "New address" });
    const response = await GET(new Request("https://shindig.test/calendar/oyster-roast.ics"));
    const text = await response.text();
    expect(text).toContain("SUMMARY:Updated roast");
    expect(text).toContain("DTSTART:20261107T230000Z");
    expect(text).toContain("LOCATION:New address");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("does not generate a calendar with old defaults if the settings database fails", async () => {
    vi.mocked(getEventConfiguration).mockRejectedValue(new Error("private database detail"));
    const response = await GET(new Request("https://shindig.test/calendar/oyster-roast.ics"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/BEGIN:VCALENDAR|private database/);
  });
});
