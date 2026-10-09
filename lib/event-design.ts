// Canonical visual tokens shared by the public playground and opt-in saved
// event designs. No event data, arbitrary CSS or external fonts live here.
export type EventDesign = {
  id: "classic" | "coastal" | "after-dark";
  name: string;
  description: string;
  paletteLabel: string;
  typographyLabel: string;
  headingFont: string;
  headingStyle: "normal" | "italic";
  bodyFont?: string;
  titleWeight?: "regular" | "bold";
  titleStyle?: "normal" | "italic";
  colorScheme?: "light" | "dark";
  colors: {
    background: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
    rule: string;
    decoration: string;
    button: string;
    buttonText: string;
  };
};

export const EVENT_DESIGNS = [
  {
    id: "classic", name: "Classic", description: "Warm, timeless, always welcome.",
    paletteLabel: "Cream & charcoal", typographyLabel: "An editorial serif",
    headingFont: '"Iowan Old Style", Baskerville, "Times New Roman", serif', headingStyle: "normal",
    colors: { background: "#f3ecdf", surface: "#fffaf1", ink: "#292922", muted: "#675e51", accent: "#765438", rule: "#c8bdac", decoration: "#e8ddc9", button: "#292922", buttonText: "#fffaf1" },
  },
  {
    id: "coastal", name: "Coastal", description: "A little breezy. A little blue.",
    paletteLabel: "Blue & ivory", typographyLabel: "A relaxed, rounded serif",
    headingFont: 'Georgia, "Times New Roman", serif', headingStyle: "normal",
    colors: { background: "#eaf2f2", surface: "#fffdf7", ink: "#183648", muted: "#496575", accent: "#205a78", rule: "#b2c9ce", decoration: "#cbdfe3", button: "#205a78", buttonText: "#fffdf7" },
  },
  {
    id: "after-dark", name: "After Dark", description: "For the evenings that linger.",
    paletteLabel: "Midnight & candlelight", typographyLabel: "An expressive italic serif",
    headingFont: 'Baskerville, "Iowan Old Style", "Times New Roman", serif', headingStyle: "italic",
    colors: { background: "#181d2a", surface: "#232a39", ink: "#f8efdc", muted: "#c4bcae", accent: "#ebcca2", rule: "#737e93", decoration: "#354157", button: "#ebcca2", buttonText: "#242b38" },
  },
] as const satisfies readonly EventDesign[];

export type EventDesignId = EventDesign["id"];
export const DEFAULT_EVENT_DESIGN: EventDesignId = "classic";

// System-font stacks keep previews and live pages fast, with no third-party
// font requests. Each pairing has explicit cross-platform fallbacks.
export const DEFAULT_BODY_FONT = '"Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif';
export const EVENT_TYPOGRAPHY = [
  { id: "editorial", name: "Editorial", description: "Classic serif + clean sans", headingFont: EVENT_DESIGNS[0].headingFont, bodyFont: DEFAULT_BODY_FONT },
  { id: "relaxed", name: "Relaxed", description: "Rounded serif + clean sans", headingFont: EVENT_DESIGNS[1].headingFont, bodyFont: DEFAULT_BODY_FONT },
  { id: "elegant", name: "Elegant", description: "Refined serif + clean sans", headingFont: EVENT_DESIGNS[2].headingFont, bodyFont: DEFAULT_BODY_FONT },
  { id: "modern", name: "Modern", description: "Friendly sans + clean sans", headingFont: '"Trebuchet MS", "Avenir Next", Arial, sans-serif', bodyFont: DEFAULT_BODY_FONT },
  { id: "storybook", name: "Storybook", description: "Warm serif + readable serif", headingFont: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif', bodyFont: 'Georgia, "Times New Roman", serif' },
] as const;
export const EVENT_PALETTES = [
  { id: "cream", name: "Cream & charcoal", colorScheme: "light", colors: EVENT_DESIGNS[0].colors },
  { id: "coast", name: "Blue & ivory", colorScheme: "light", colors: EVENT_DESIGNS[1].colors },
  { id: "midnight", name: "Midnight & candlelight", colorScheme: "dark", colors: EVENT_DESIGNS[2].colors },
  { id: "fern", name: "Fern & linen", colorScheme: "light", colors: { background: "#edf0e6", surface: "#fbfcf4", ink: "#273729", muted: "#50634f", accent: "#37593c", rule: "#b4c0ad", decoration: "#d7e1cc", button: "#37593c", buttonText: "#fbfcf4" } },
  { id: "rose", name: "Rose & berry", colorScheme: "light", colors: { background: "#f5e9e9", surface: "#fff7f5", ink: "#422b34", muted: "#775560", accent: "#883d59", rule: "#d9b9c0", decoration: "#efdae0", button: "#75364f", buttonText: "#fff7f5" } },
  { id: "clay", name: "Clay & cream", colorScheme: "light", colors: { background: "#f3e7da", surface: "#fff8ed", ink: "#472e24", muted: "#775745", accent: "#8b492b", rule: "#d2bba8", decoration: "#ead5c1", button: "#7c4029", buttonText: "#fff8ed" } },
] as const;
export type EventTypographyId = typeof EVENT_TYPOGRAPHY[number]["id"];
export type EventPaletteId = typeof EVENT_PALETTES[number]["id"];
export const EVENT_STYLE_DEFAULTS = {
  classic: { typography: "editorial", palette: "cream" },
  coastal: { typography: "relaxed", palette: "coast" },
  "after-dark": { typography: "elegant", palette: "midnight" },
} as const satisfies Record<EventDesignId, { typography: EventTypographyId; palette: EventPaletteId }>;

export function parseEventDesignId(value: unknown): EventDesignId | null {
  return EVENT_DESIGNS.find(({ id }) => id === value)?.id ?? null;
}

export function getEventDesign(id: unknown): EventDesign {
  return EVENT_DESIGNS.find((design) => design.id === id) ?? EVENT_DESIGNS[0];
}

export function eventDesignVariables(design: EventDesign): Record<`--design-${string}`, string> {
  return {
    ...Object.fromEntries(Object.entries(design.colors).map(([key, value]) => [`--design-${key}`, value])),
    "--design-heading-font": design.headingFont,
    "--design-heading-style": design.headingStyle,
    "--design-body-font": design.bodyFont ?? DEFAULT_BODY_FONT,
    "--design-title-weight": design.titleWeight === "bold" ? "700" : "400",
    "--design-title-style": design.titleStyle ?? design.headingStyle,
  };
}
