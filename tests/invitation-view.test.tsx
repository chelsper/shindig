import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INVITATION_SETTINGS, resolveEventConfiguration } from "../lib/invitation-settings";
vi.mock("../app/actions", () => ({ submitRsvp: vi.fn() }));
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: vi.fn() }));
import Home, { generateMetadata } from "../app/page";
import { getEventConfiguration } from "../lib/server/invitation-settings";
import { EventHubHeader } from "../components/event-hub/event-hub-header";
import { DEFAULT_EVENT_HUB_HEADER } from "../lib/event-hub-settings";
import { WeatherContent } from "../components/event-hub/weather-content";
const event = resolveEventConfiguration({
  ...DEFAULT_INVITATION_SETTINGS, title: "Changed roast", description: "Changed welcome <script>alert(1)</script>",
  startsAtUtc: "2026-12-12T23:00:00.000Z", endsAtUtc: "2026-12-13T03:00:00.000Z", address: "Changed address",
  invitation: { ...DEFAULT_INVITATION_SETTINGS.invitation, rsvpHeading: "Coming along?", eyebrow: "An invitation", timeNote: "come hungry" },
});
beforeEach(() => { vi.mocked(getEventConfiguration).mockResolvedValue(event); });
describe("published invitation presentation", () => {
  it("renders published text, artwork and dates, without changing RSVP or navigation", async () => {
    const html = renderToStaticMarkup(await Home());
    for (const value of ["Changed roast", "Coming along?", "An invitation", "Changed address", "Saturday, December 12, 2026", "6:00 PM", "come hungry", "December ’26", "Submit RSVP", 'href="/event"']) expect(html).toContain(value);
    expect(html).not.toContain("<script>alert"); expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("November 7");
    expect(await generateMetadata()).toEqual({ title: event.title, description: event.description });
  });
  it("keeps Hub artwork separate but uses shared event details and directions", () => {
    const html = renderToStaticMarkup(<EventHubHeader event={event} headerSettings={DEFAULT_EVENT_HUB_HEADER} />);
    expect(html).toContain(event.title); expect(html).toContain("Changed%20address");
    expect(html).toContain(event.dateLabel); expect(html).toContain("6:00 PM");
    expect(html).toContain("oyster-roast-invitation.png");
  });
  it("uses the updated event month for historical weather context", () => {
    const html = renderToStaticMarkup(<WeatherContent event={event} weather={null} typical={undefined} />);
    expect(html).toContain("context for December"); expect(html).not.toContain("November");
  });
  it("offers a retry instead of stale invitation content when configuration cannot load", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getEventConfiguration).mockRejectedValue(new Error("private connection data"));
    try {
      const html = renderToStaticMarkup(await Home());
      expect(html).toContain("latest event details"); expect(html).not.toMatch(/Submit RSVP|November 7|private connection data/);
      expect(await generateMetadata()).toEqual({ title: "Invitation | Shindig" });
    } finally { log.mockRestore(); }
  });
});
