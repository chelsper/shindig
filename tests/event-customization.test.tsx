import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EVENT_DESIGNS, EVENT_PALETTES, EVENT_TYPOGRAPHY, eventDesignVariables } from "../lib/event-design";
import { appearanceChoices, appearanceSummary, parseEventAppearance, resolveEventAppearance, type EventAppearance } from "../lib/event-appearance";
import { EMPTY_DRAFT_ARTWORK, validateDraftArtwork } from "../lib/event-draft-artwork";
import { EventAppearanceControls } from "../components/admin/event-appearance-controls";
import { DraftDesignControls } from "../components/admin/draft-design-controls";
import { DesignedHub, DesignedInvitation } from "../components/event-design/event-presentation";
import { compareEventPublication } from "../lib/event-publication-changes";
import { parsePublicationSnapshot, publicationEvent } from "../lib/event-publication";
import { eventId, snapshot } from "./fixtures/publication";

const base: EventAppearance = { style: "coastal", invitationCrop: { x: 17, y: 86, zoom: 220 } };
const custom: EventAppearance = { ...base, typography: "storybook", palette: "rose", titleWeight: "bold", titleStyle: "italic" };
const withDesign = (design: EventAppearance) => ({ ...snapshot, artwork: { ...EMPTY_DRAFT_ARTWORK, design } });
type Element = ReactElement<Record<string, unknown>>;
function find(predicate: (element: Element) => boolean, node: ReactNode): Element | undefined {
  if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return predicate(node) ? node : find(predicate, node.props.children as ReactNode);
}
function contrast(a: string, b: string) {
  function light(hex: string) { const [r, g, b] = hex.slice(1).match(/../g)!.map((part) => { const v = parseInt(part, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return r * .2126 + g * .7152 + b * .0722; }
  const x = light(a), y = light(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

describe("curated design customization", () => {
  it.each(EVENT_DESIGNS)("keeps legacy $id appearance unchanged when choices are absent", (style) => {
    const design = { ...base, style: style.id };
    expect(parseEventAppearance(design)).toEqual(design);
    const resolved = resolveEventAppearance(design);
    expect(resolved.colors).toEqual(style.colors); expect(resolved.headingFont).toBe(style.headingFont);
    expect(resolved.titleStyle).toBe(style.headingStyle); expect(resolved.titleWeight).toBe("regular");
    expect(eventDesignVariables(resolved)).toEqual(eventDesignVariables(style));
  });
  it("round-trips only whitelisted choices through stored drafts and public snapshots", () => {
    expect(parseEventAppearance(custom)).toEqual(custom);
    expect(publicationEvent(eventId, parsePublicationSnapshot(eventId, withDesign(custom))).design).toEqual(custom);
    expect(JSON.stringify(validateDraftArtwork(eventId, withDesign(custom).artwork)).length).toBeLessThan(4096);
    expect(appearanceSummary(custom)).toBe("Coastal · Rose & berry · Storybook · Bold italic title");
  });
  it.each([
    { palette: "#fff" }, { palette: null }, { palette: ["rose"] }, { palette: "constructor" },
    { typography: "url(https://evil.test/font)" }, { typography: null }, { typography: {} },
    { titleWeight: 700 }, { titleWeight: "900" }, { titleStyle: "oblique" }, { titleStyle: null },
    { bodyFont: "evil" }, { css: "display:none" }, { background: "url(evil)" },
  ])("rejects arbitrary style input server-side: %j", (patch) => {
    const design = { ...custom, ...patch };
    expect(parseEventAppearance(design)).toBeNull();
    expect(validateDraftArtwork(eventId, { ...EMPTY_DRAFT_ARTWORK, design }).ok).toBe(false);
    expect(() => parsePublicationSnapshot(eventId, { ...snapshot, artwork: { ...EMPTY_DRAFT_ARTWORK, design } })).toThrow();
  });
  it.each(EVENT_PALETTES)("keeps $name text and buttons at accessible contrast", ({ colors }) => {
    for (const background of [colors.background, colors.surface]) for (const foreground of [colors.ink, colors.muted, colors.accent]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.buttonText, colors.button)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.ink, colors.decoration)).toBeGreaterThanOrEqual(4.5);
  });
  it("supports every pairing/palette with independent layout, no arbitrary CSS and no font requests", () => {
    expect(EVENT_TYPOGRAPHY).toHaveLength(5); expect(EVENT_PALETTES).toHaveLength(6);
    for (const typography of EVENT_TYPOGRAPHY) for (const palette of EVENT_PALETTES) {
      const appearance = { ...custom, typography: typography.id, palette: palette.id };
      expect(parseEventAppearance(appearance)).toEqual(appearance);
      const resolved = resolveEventAppearance(appearance);
      expect(resolved.id).toBe("coastal"); expect(resolved.headingFont).toBe(typography.headingFont);
      expect(resolved.bodyFont).toBe(typography.bodyFont); expect(resolved.colors).toEqual(palette.colors);
      expect(resolved.colorScheme).toBe(palette.colorScheme); expect(JSON.stringify(eventDesignVariables(resolved))).not.toMatch(/https?:|url\(/);
    }
  });
  it.each([DesignedInvitation, DesignedHub])("shares resolved text styling on invitations and Hubs", (Component) => {
    const html = renderToStaticMarkup(<Component appearance={{ ...custom, palette: "midnight" }} details={{ title: "A little gathering", eyebrow: "Welcome", date: "Saturday", time: "5 PM", venue: "Garden", address: "Test address", description: "Stay awhile." }} image={{ url: "/art.png", alt: "Uploaded artwork", crop: base.invitationCrop }} />);
    for (const value of ['data-event-design="coastal"', 'data-color-scheme="dark"', "--design-title-weight:700", "--design-title-style:italic", "--design-body-font:Georgia", "--design-surface:#232a39", "object-position:17% 86%", "scale(2.2)"]) expect(html).toContain(value);
    expect(html).not.toContain("/admin/");
  });
});

describe("design customization controls", () => {
  it("provides accessible controls and honest preview/reset guidance without a submit action", () => {
    const html = renderToStaticMarkup(<EventAppearanceControls appearance={custom} disabled={false} onChange={() => {}} />);
    expect(html.match(/name="event-palette"/g)).toHaveLength(6);
    expect(html.match(/<option/g)).toHaveLength(5);
    for (const text of ["Font pairing", "Italic title", "not lettering inside uploaded artwork", "Reset colors &amp; type to Coastal", "guests see them only after publishing"]) expect(html).toContain(text);
    expect(html).not.toContain('type="submit"');
  });
  it("updates each choice independently and reset preserves the crop and style", () => {
    const change = vi.fn(), tree = EventAppearanceControls({ appearance: custom, disabled: false, onChange: change });
    const fire = (predicate: (el: Element) => boolean, input?: unknown) => (find(predicate, tree)!.props.onChange as (event: unknown) => void)(input);
    fire(el => el.props.name === "event-palette" && el.props.value === "fern");
    expect(change).toHaveBeenLastCalledWith({ ...custom, palette: "fern" });
    fire(el => el.type === "select", { target: { value: "modern" } });
    expect(change).toHaveBeenLastCalledWith({ ...custom, typography: "modern" });
    fire(el => el.props.name === "event-title-weight" && el.props.value === "regular");
    expect(change).toHaveBeenLastCalledWith({ ...custom, titleWeight: "regular" });
    fire(el => el.props.type === "checkbox", { target: { checked: false } });
    expect(change).toHaveBeenLastCalledWith({ ...custom, titleStyle: "normal" });
    (find(el => el.type === "button", tree)!.props.onClick as () => void)();
    expect(change).toHaveBeenLastCalledWith(base);
  });
  it("blocks edits while saving and disables an unnecessary reset", () => {
    const change = vi.fn(), tree = EventAppearanceControls({ appearance: custom, disabled: true, onChange: change });
    expect(find(el => el.type === "fieldset", tree)!.props.disabled).toBe(true);
    (find(el => el.props.name === "event-palette", tree)!.props.onChange as () => void)();
    (find(el => el.type === "button", tree)!.props.onClick as () => void)(); expect(change).not.toHaveBeenCalled();
    const defaults = EventAppearanceControls({ appearance: base, disabled: false, onChange: change });
    expect(find(el => el.type === "button", defaults)!.props.disabled).toBe(true);
  });
  it("preserves images/header crop and resets overrides only when choosing a new style", () => {
    const change = vi.fn(), settings = { ...EMPTY_DRAFT_ARTWORK, design: custom, header: { ...EMPTY_DRAFT_ARTWORK.header, focalX: 20, zoomPercent: 220 } };
    const tree = DraftDesignControls({ settings, onChange: change, disabled: false });
    (find(el => el.type === EventAppearanceControls, tree)!.props.onChange as (appearance: EventAppearance) => void)(base);
    expect(change).toHaveBeenLastCalledWith({ ...settings, design: base });
    (find(el => el.props.name === "event-style" && el.props.value === "classic", tree)!.props.onChange as () => void)();
    expect(change).toHaveBeenLastCalledWith({ ...settings, design: { ...base, style: "classic" } });
    const original = renderToStaticMarkup(<DraftDesignControls settings={EMPTY_DRAFT_ARTWORK} onChange={change} disabled={false} />);
    expect(original).not.toContain('name="event-palette"'); expect(original).toContain("Original layout stays exactly as it is");
  });
});

describe("customization publish review", () => {
  it("detects each customization even without a layout or crop change", () => {
    const review = compareEventPublication(eventId, withDesign(base), withDesign(custom));
    expect(review.groups.flatMap(({ changes }) => changes.map(({ id }) => id))).toEqual(["palette", "typography", "titleWeight", "titleStyle"]);
    expect(review.calendarChanged).toBe(false);
  });
  it("treats explicit preset defaults as identical to a legacy saved design", () => {
    expect(compareEventPublication(eventId, withDesign(base), withDesign({ ...base, ...appearanceChoices(base) })).changeCount).toBe(0);
  });
  it("describes custom choices when a layout changes or is first enabled", () => {
    const review = compareEventPublication(eventId, snapshot, withDesign(custom));
    expect(review.groups[0].changes[0]).toMatchObject({ id: "style", note: appearanceSummary(custom) });
  });
});
