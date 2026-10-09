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
  };
}
