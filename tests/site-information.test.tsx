import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPage, { metadata as privacyMetadata } from "../app/privacy/page";
import SupportPage, { metadata as supportMetadata } from "../app/support/page";
import { SHINDIG_BUSINESS, SHINDIG_SITE } from "../lib/site";

// Public help must not depend on host sessions or database availability.
vi.mock("next/headers", () => ({
  headers: () => { throw new Error("Information pages must not read request headers"); },
  cookies: () => { throw new Error("Information pages must not require a session"); },
}));
vi.mock("../lib/server/host-access", () => ({ getHostPrincipal: () => { throw new Error("Private host lookup"); } }));
afterEach(() => vi.unstubAllEnvs());

describe("public privacy and support pages", () => {
  it.each([
    ["privacy", PrivacyPage, privacyMetadata],
    ["support", SupportPage, supportMetadata],
  ] as const)("renders /%s without credentials or sign-in, with canonical identity and navigation", (path, Page, metadata) => {
    for (const key of ["DATABASE_URL", "ADMIN_PASSWORD", "GOOGLE_CLIENT_SECRET", "BETTER_AUTH_SECRET"]) vi.stubEnv(key, "");
    const html = renderToStaticMarkup(<Page />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain(SHINDIG_BUSINESS.name);
    expect(html).toContain(SHINDIG_BUSINESS.location);
    expect(html).toContain(SHINDIG_BUSINESS.supportEmail);
    expect(metadata.alternates?.canonical).toBe(new URL(path, SHINDIG_SITE.url).href);
    for (const href of ["/", "/host/sign-in", "/privacy", "/support"]) expect(html).toContain(`href="${href}"`);
    expect(html).not.toMatch(/DATABASE_URL|ADMIN_PASSWORD|GOOGLE_CLIENT_SECRET|BETTER_AUTH_SECRET|haveashindigcom@gmail\.com/);
    expect(html).not.toContain("<form");
  });

  it("provides policy contents links that target unique, labeled sections", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
    expect(anchors).toHaveLength(8);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of anchors) {
      expect(ids).toContain(id);
      expect(html).toContain(`aria-labelledby="${id}-heading"`);
    }
    expect(html).toContain('dateTime="2026-10-27"');
  });

  it("explains current privacy controls and limitations without promising new features", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);
    for (const copy of [
      "Google is not used to read your Gmail, contacts, or calendar",
      "Hidden attending guests still count toward the total",
      "There is no automatic event-data cleanup or self-service account deletion yet",
      "Shindig currently does not send these messages",
      "Calendar entries can include your private RSVP edit link",
      "Shortcuts stop appearing after 180 days",
      "We review requests manually",
      "Vercel", "Neon", "ImprovMX", "Spotify", "Open-Meteo", "U.S. Census Geocoder",
    ]) expect(html).toContain(copy);
    expect(html).toContain("No online service can guarantee absolute security");
    expect(html).not.toMatch(/GDPR.compliant|automatically deleted after/i);
  });

  it("opens email without automatically sending or pre-filling sensitive details", () => {
    for (const Page of [PrivacyPage, SupportPage]) {
      const html = renderToStaticMarkup(<Page />);
      const addresses = [...html.matchAll(/href="(mailto:[^"]+)"/g)].map(match => match[1]);
      expect(addresses.length).toBeGreaterThan(0);
      expect(new Set(addresses)).toEqual(new Set([`mailto:${SHINDIG_BUSINESS.supportEmail}`]));
    }
  });

  it("uses compact native FAQ disclosures and protects private edit links in support guidance", () => {
    const html = renderToStaticMarkup(<SupportPage />);
    expect(html.match(/<details\b/g)).toHaveLength(7);
    expect(html.match(/<summary\b/g)).toHaveLength(7);
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html).toContain("nothing is sent automatically");
    expect(html).toContain("private RSVP or signup edit links, or guest lists");
    expect(html).toContain("completed directly with Google");
    expect(html).toContain("Saving an event draft and publishing it are separate steps");
  });
});
