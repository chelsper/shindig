import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EVENT_DESIGN, EVENT_DESIGNS, eventDesignVariables, getEventDesign } from "../lib/event-design";
import { DesignStudio } from "../components/design-studio/design-studio";
import { InvitationDesignPreview } from "../components/design-studio/invitation-design-preview";
import { EventHubDesignPreview } from "../components/design-studio/event-hub-design-preview";
import { DesignPreview } from "../components/design-studio/design-preview";
import { DESIGN_PREVIEW_EVENT, DESIGN_PREVIEW_WIDTHS, fitDesignPreview } from "../lib/design-preview";
import Page, { metadata } from "../app/design/page";

function luminance(hex: string) {
  const values = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + .05) / (dark + .05);
}
afterEach(() => vi.unstubAllEnvs());

describe("curated event designs", () => {
  it("defines exactly three stable styles with Classic as the default", () => {
    expect(EVENT_DESIGNS.map(({ id }) => id)).toEqual(["classic", "coastal", "after-dark"]);
    expect(DEFAULT_EVENT_DESIGN).toBe("classic");
    expect(new Set(EVENT_DESIGNS.map(({ headingFont, headingStyle }) => `${headingFont}:${headingStyle}`)).size).toBe(3);
  });
  it.each([null, undefined, "unknown", "__proto__", "<script>", { id: "coastal" }])("falls back safely for %j", (id) => {
    expect(getEventDesign(id)).toBe(EVENT_DESIGNS[0]);
  });
  it.each(EVENT_DESIGNS)("keeps $name text and button colors above WCAG AA normal-text contrast", (design) => {
    for (const color of Object.values(design.colors)) expect(color).toMatch(/^#[a-f\d]{6}$/i);
    for (const background of [design.colors.background, design.colors.surface]) {
      for (const foreground of [design.colors.ink, design.colors.muted, design.colors.accent]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(design.colors.buttonText, design.colors.button)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(design.colors.ink, design.colors.decoration)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(EVENT_DESIGNS)("uses $name tokens on a scoped preview without altering event content", (design) => {
    expect(getEventDesign(design.id)).toBe(design);
    const variables = eventDesignVariables(design);
    expect(Object.keys(variables).every((key) => key.startsWith("--design-"))).toBe(true);
    const html = renderToStaticMarkup(<InvitationDesignPreview designId={design.id} />);
    expect(html).toContain(`data-design="${design.id}"`);
    expect(html).toContain(`--design-ink:${design.colors.ink}`);
    for (const text of ["dinner party.", "Sam &amp; Alex", "Saturday, November 14", "The garden table", "Kindly reply", "RSVP is not active"]) expect(html).toContain(text);
    expect(html).not.toMatch(/<button|<input|<form|href=|\/api\/|172 Belmont|Jasper|oyster-roast/);
  });
});

describe("preview-only design studio", () => {
  it("provides accessible single-choice styles, an honest preview, and reset", () => {
    const html = renderToStaticMarkup(<DesignStudio />);
    expect(html.match(/type="radio"/g)).toHaveLength(7);
    expect(html.match(/checked=""/g)).toHaveLength(3);
    expect(html).toMatch(/value="classic"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reset to Classic/);
    for (const { name, id } of EVENT_DESIGNS) {
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain(`aria-describedby="style-description-${id}"`);
    }
    expect(html).toContain("Nothing is saved or published.");
    expect(html).toContain('href="/admin/design?style=classic"');
    expect(html).toContain("Use this design");
    expect(html).toContain("Only your style choice carries over");
    expect(html).toContain("fictional dinner party");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Preview page");
    expect(html).toContain("Preview size");
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs.find((input) => input.includes('name="preview-page"') && input.includes('value="invitation"'))).toContain('checked=""');
    expect(inputs.find((input) => input.includes('name="preview-device"') && input.includes('value="phone"'))).toContain('checked=""');
    expect(html.match(/aria-controls="design-preview-content"/g)).toHaveLength(4);
    expect(html).toContain("sample actions are inactive");
    expect(html).not.toMatch(/<form|Save design|Publish design|Sign in/);
  });
  it.each(["development", "production", "test"])("is available in %s without authentication or a database", (environment) => {
    vi.stubEnv("NODE_ENV", environment); vi.stubEnv("DATABASE_URL", "");
    expect(renderToStaticMarkup(Page())).toContain("Set the");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
  it("has no persistence, guest actions, real-event imports, or global style overrides", async () => {
    const files = await Promise.all(["app/design/page.tsx", "components/design-studio/design-studio.tsx", "components/design-studio/invitation-design-preview.tsx", "components/design-studio/event-hub-design-preview.tsx", "components/design-studio/design-preview.tsx", "components/design-studio/preview-frame.tsx", "components/design-studio/artwork-controls.tsx", "components/design-studio/artwork-crop.tsx", "components/design-studio/use-design-artwork.ts", "lib/event-design.ts", "lib/design-preview.ts", "lib/design-artwork.ts", "lib/local-design-artwork.ts"].map((path) => readFile(path, "utf8")));
    for (const text of files) expect(text).not.toMatch(/\bfetch\(|localStorage|sessionStorage|lib\/server\/|oyster-roast-event|app\/actions|use server/);
    const css = await readFile("components/design-studio/design-studio.module.css", "utf8");
    expect(css).not.toMatch(/:root|:global|^body\s*\{|^html\s*\{/m);
  });
});

describe("invitation and Hub preview combinations", () => {
  for (const design of EVENT_DESIGNS) {
    for (const page of ["invitation", "hub"] as const) {
      it.each(["phone", "desktop"] as const)(`renders ${design.name} ${page} at %s size with no live actions`, (device) => {
        const html = renderToStaticMarkup(<DesignPreview designId={design.id} page={page} device={device} />);
        expect(html).toContain(`data-device="${device}"`);
        expect(html).toContain(`width:${DESIGN_PREVIEW_WIDTHS[device]}px`);
        expect(html).toContain(`data-design="${design.id}"`);
        expect(html).toContain(`--design-ink:${design.colors.ink}`);
        for (const text of [DESIGN_PREVIEW_EVENT.date, DESIGN_PREVIEW_EVENT.time, DESIGN_PREVIEW_EVENT.venue]) expect(html).toContain(text);
        expect(html).toContain(page === "invitation" ? "RSVP is not active" : "Fictional names");
        expect(html).not.toMatch(/<button|<input|<form|href=|src=|<iframe|\/api\/|172 Belmont|Jasper|oyster-roast/);
        expect(html.match(/<article/g)).toHaveLength(1);
      });
    }
  }
  it("uses only fictional guest names and a derived, consistent count", () => {
    const html = renderToStaticMarkup(<EventHubDesignPreview designId="classic" />);
    const total = DESIGN_PREVIEW_EVENT.guests.reduce((count, guest) => count + guest.partySize, 0);
    expect(total).toBe(8);
    expect(html).toContain(`${total} guests`);
    expect(html).toContain("Fictional sample guest list");
    expect(html).toContain(DESIGN_PREVIEW_EVENT.update.message);
    expect(html).toContain("calendar and directions are inactive");
    expect(html).not.toMatch(/created_at|updated_at|guest_id|edit_token|database|forecast|Spotify/);
  });
  it("responds to the preview canvas rather than the viewer’s device", async () => {
    const css = await readFile("components/design-studio/design-studio.module.css", "utf8");
    expect(css).toContain("container: design-preview / inline-size");
    expect(css).toContain("@container design-preview (min-width: 700px)");
  });
});

describe("preview fitting", () => {
  it("fits a desktop canvas onto a narrow phone without changing its layout width", () => {
    const fit = fitDesignPreview("desktop", 280, 1000);
    expect(fit.width).toBeCloseTo(280);
    expect(fit.height).toBeCloseTo(1000 * 280 / 960);
    expect(fit.scale).toBeCloseTo(280 / 960);
  });
  it("never enlarges the phone preview and resizes its height with content", () => {
    expect(fitDesignPreview("phone", 900, 800)).toEqual({ scale: 1, width: 390, height: 800 });
    expect(fitDesignPreview("phone", 195, 1000)).toEqual({ scale: .5, width: 195, height: 500 });
  });
  it.each([0, -10, NaN, Infinity])("uses finite defaults before measurement (%s)", (value) => {
    expect(fitDesignPreview("desktop", value, value)).toEqual({ scale: 1, width: 960, height: 0 });
  });
});
