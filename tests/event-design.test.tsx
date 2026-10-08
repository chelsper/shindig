import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EVENT_DESIGN, EVENT_DESIGNS, eventDesignVariables, getEventDesign } from "../lib/event-design";
import { DesignStudio } from "../components/design-studio/design-studio";
import { InvitationDesignPreview } from "../components/design-studio/invitation-design-preview";
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
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/value="classic"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reset to Classic/);
    for (const { name, id } of EVENT_DESIGNS) {
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain(`aria-describedby="style-description-${id}"`);
    }
    expect(html).toContain("Nothing is saved or published.");
    expect(html).toContain("fictional dinner party");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toMatch(/<form|Save design|Publish design|Sign in/);
  });
  it.each(["development", "production", "test"])("is available in %s without authentication or a database", (environment) => {
    vi.stubEnv("NODE_ENV", environment); vi.stubEnv("DATABASE_URL", "");
    expect(renderToStaticMarkup(Page())).toContain("Set the");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
  it("has no persistence, guest actions, real-event imports, or global style overrides", async () => {
    const files = await Promise.all(["app/design/page.tsx", "components/design-studio/design-studio.tsx", "components/design-studio/invitation-design-preview.tsx", "lib/event-design.ts"].map((path) => readFile(path, "utf8")));
    for (const text of files) expect(text).not.toMatch(/\bfetch\(|localStorage|sessionStorage|lib\/server\/|oyster-roast-event|app\/actions|use server/);
    const css = await readFile("components/design-studio/design-studio.module.css", "utf8");
    expect(css).not.toMatch(/:root|:global|^body\s*\{|^html\s*\{/m);
  });
});
