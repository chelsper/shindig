import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("../app/actions", () => ({ submitRsvp: vi.fn() }));
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: vi.fn() }));

import { headers } from "next/headers";
import { getEventConfiguration } from "../lib/server/invitation-settings";
import Home, { generateMetadata } from "../app/page";
import Invitation, { generateMetadata as invitationMetadata } from "../app/invitation/page";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { isOysterRoastHost, SHINDIG_SITE } from "../lib/site";

const setHost = (host: string) => vi.mocked(headers).mockResolvedValue(new Headers({ host }) as Awaited<ReturnType<typeof headers>>);
beforeEach(() => {
  vi.clearAllMocks();
  setHost("www.haveashindig.com");
  vi.mocked(getEventConfiguration).mockResolvedValue(OYSTER_ROAST_EVENT);
});

describe("domain separation", () => {
  it.each(["jaspershucks.app", "www.jaspershucks.app", "WWW.JASPERSHUCKS.APP:443", "jaspershucks.app."])("recognizes the exact event domain %s", (host) => {
    expect(isOysterRoastHost(host)).toBe(true);
  });
  it.each([null, "", "www.haveashindig.com", "haveashindig.com", "localhost:3000", "preview.vercel.app", "jaspershucks.app.evil.test", "evil-jaspershucks.app", "evil.test,jaspershucks.app", "https://jaspershucks.app", "jaspershucks.app@evil.test", "jaspershucks.app/path"])("does not treat %s as the event host", (host) => {
    expect(isOysterRoastHost(host)).toBe(false);
  });
  it.each(["www.haveashindig.com", "haveashindig.com", "localhost:3000", "preview.vercel.app"])("renders the independent brand home on %s without reading event or guest data", async (host) => {
    setHost(host);
    vi.mocked(getEventConfiguration).mockRejectedValue(new Error("database unavailable"));
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Good people.");
    expect(html).toContain('href="/admin"');
    expect(html).not.toMatch(/Oyster Roast|Belmont|Submit RSVP|guestName|DATABASE_URL|ADMIN_PASSWORD|Create an event/);
    expect(await generateMetadata()).toEqual({ title: SHINDIG_SITE.title, description: SHINDIG_SITE.description, alternates: { canonical: SHINDIG_SITE.url } });
    expect(getEventConfiguration).not.toHaveBeenCalled();
  });
  it.each(["www.jaspershucks.app", "jaspershucks.app"])("preserves the published invitation and RSVP at %s", async (host) => {
    setHost(host);
    const event = { ...OYSTER_ROAST_EVENT, title: "Host-edited invitation", description: "Saved from the shared admin." };
    vi.mocked(getEventConfiguration).mockResolvedValue(event);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain(event.title);
    expect(html).toContain(event.description);
    expect(html).toContain("Submit RSVP");
    expect(html).toContain('href="/event"');
    expect(html).not.toContain("Good people.");
    expect(await generateMetadata()).toEqual({ title: event.title, description: event.description, alternates: { canonical: "https://www.jaspershucks.app/" } });
  });
  it("keeps host-dependent renders and metadata separate in the same process", async () => {
    setHost("www.jaspershucks.app");
    expect(renderToStaticMarkup(await Home())).toContain("Submit RSVP");
    setHost("www.haveashindig.com");
    expect(renderToStaticMarkup(await Home())).not.toContain("Submit RSVP");
    expect((await generateMetadata()).title).toBe(SHINDIG_SITE.title);
    setHost("www.jaspershucks.app");
    expect((await generateMetadata()).title).toBe(OYSTER_ROAST_EVENT.title);
  });
  it("does not use an untrusted forwarded host or reflect an arbitrary host into links", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ host: "unknown.test", "x-forwarded-host": "www.jaspershucks.app" }) as Awaited<ReturnType<typeof headers>>);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Good people.");
    expect(JSON.stringify(await generateMetadata())).not.toContain("unknown.test");
  });
  it("keeps the explicit invitation available on the brand and preview hosts", async () => {
    const html = renderToStaticMarkup(await Invitation());
    expect(html).toContain(OYSTER_ROAST_EVENT.title);
    expect(html).toContain("Submit RSVP");
    expect(html).toContain('href="/event"');
    expect((await invitationMetadata()).alternates?.canonical).toBe(OYSTER_ROAST_EVENT.websiteUrl);
    expect(headers).not.toHaveBeenCalled();
  });
});
