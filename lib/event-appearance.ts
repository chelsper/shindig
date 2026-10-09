import { EVENT_DESIGNS, type EventDesignId } from "./event-design";
import { type ArtworkCrop } from "./design-artwork";

// Absence means the original presentation. Opting in is an explicit draft edit,
// never a default applied to an already-published event.
export type EventAppearance = { style: EventDesignId; invitationCrop: ArtworkCrop };
export function parseEventAppearance(input: unknown): EventAppearance | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (!EVENT_DESIGNS.some(({ id }) => id === row.style) || Object.keys(row).some((key) => !["style", "invitationCrop"].includes(key))) return null;
  const crop = row.invitationCrop as Record<string, unknown> | null;
  if (!crop || typeof crop !== "object" || Array.isArray(crop) || Object.keys(crop).some((key) => !["x", "y", "zoom"].includes(key))) return null;
  for (const [key, min, max] of [["x", 0, 100], ["y", 0, 100], ["zoom", 100, 250]] as const) {
    if (typeof crop[key] !== "number" || !Number.isInteger(crop[key]) || crop[key] < min || crop[key] > max) return null;
  }
  return { style: row.style as EventDesignId, invitationCrop: { x: crop.x as number, y: crop.y as number, zoom: crop.zoom as number } };
}
