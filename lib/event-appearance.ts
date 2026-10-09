import { EVENT_DESIGNS, EVENT_PALETTES, EVENT_TYPOGRAPHY, EVENT_STYLE_DEFAULTS, getEventDesign, type EventDesign, type EventDesignId, type EventPaletteId, type EventTypographyId } from "./event-design";
import { type ArtworkCrop } from "./design-artwork";

// Absence means the original presentation. Opting in is an explicit draft edit,
// never a default applied to an already-published event.
export type EventAppearance = {
  style: EventDesignId; invitationCrop: ArtworkCrop;
  palette?: EventPaletteId; typography?: EventTypographyId;
  titleWeight?: "regular" | "bold"; titleStyle?: "normal" | "italic";
};

export function appearanceChoices(appearance: EventAppearance) {
  return {
    palette: appearance.palette ?? EVENT_STYLE_DEFAULTS[appearance.style].palette,
    typography: appearance.typography ?? EVENT_STYLE_DEFAULTS[appearance.style].typography,
    titleWeight: appearance.titleWeight ?? "regular",
    titleStyle: appearance.titleStyle ?? getEventDesign(appearance.style).headingStyle,
  };
}
export function resolveEventAppearance(appearance: EventAppearance): EventDesign {
  const choices = appearanceChoices(appearance);
  const palette = EVENT_PALETTES.find(({ id }) => id === choices.palette)!;
  const typography = EVENT_TYPOGRAPHY.find(({ id }) => id === choices.typography)!;
  return { ...getEventDesign(appearance.style), colors: palette.colors, colorScheme: palette.colorScheme,
    paletteLabel: palette.name, typographyLabel: typography.name, headingFont: typography.headingFont, bodyFont: typography.bodyFont,
    titleWeight: choices.titleWeight, titleStyle: choices.titleStyle };
}
export function appearanceSummary(appearance: EventAppearance) {
  const design = resolveEventAppearance(appearance);
  return `${design.name} · ${design.paletteLabel} · ${design.typographyLabel} · ${design.titleWeight === "bold" ? "Bold" : "Regular"}${design.titleStyle === "italic" ? " italic" : ""} title`;
}

export function parseEventAppearance(input: unknown): EventAppearance | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (!EVENT_DESIGNS.some(({ id }) => id === row.style) || Object.keys(row).some((key) => !["style", "invitationCrop", "palette", "typography", "titleWeight", "titleStyle"].includes(key))) return null;
  if (("palette" in row && !EVENT_PALETTES.some(({ id }) => id === row.palette)) ||
    ("typography" in row && !EVENT_TYPOGRAPHY.some(({ id }) => id === row.typography)) ||
    ("titleWeight" in row && row.titleWeight !== "regular" && row.titleWeight !== "bold") ||
    ("titleStyle" in row && row.titleStyle !== "normal" && row.titleStyle !== "italic")) return null;
  const crop = row.invitationCrop as Record<string, unknown> | null;
  if (!crop || typeof crop !== "object" || Array.isArray(crop) || Object.keys(crop).some((key) => !["x", "y", "zoom"].includes(key))) return null;
  for (const [key, min, max] of [["x", 0, 100], ["y", 0, 100], ["zoom", 100, 250]] as const) {
    if (typeof crop[key] !== "number" || !Number.isInteger(crop[key]) || crop[key] < min || crop[key] > max) return null;
  }
  return { style: row.style as EventDesignId, invitationCrop: { x: crop.x as number, y: crop.y as number, zoom: crop.zoom as number },
    ...("palette" in row ? { palette: row.palette as EventPaletteId } : {}),
    ...("typography" in row ? { typography: row.typography as EventTypographyId } : {}),
    ...("titleWeight" in row ? { titleWeight: row.titleWeight as "regular" | "bold" } : {}),
    ...("titleStyle" in row ? { titleStyle: row.titleStyle as "normal" | "italic" } : {}),
  };
}
