import type { CSSProperties } from "react";
import type { ArtworkCrop } from "./design-artwork";

// Legacy framing is the phone crop and the desktop fallback. Optional desktop
// framing is additive, so previously saved/published artwork stays unchanged.
export function parseArtworkCrop(value: unknown, maxZoom = 250): ArtworkCrop | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const crop = value as Record<string, unknown>;
  if (Object.keys(crop).some(key => !["x", "y", "zoom"].includes(key))) return null;
  for (const [key, min, max] of [["x", 0, 100], ["y", 0, 100], ["zoom", 100, maxZoom]] as const) {
    if (typeof crop[key] !== "number" || !Number.isInteger(crop[key]) || crop[key] < min || crop[key] > max) return null;
  }
  return { x: crop.x as number, y: crop.y as number, zoom: crop.zoom as number };
}

export function responsiveArtworkStyle(phone: ArtworkCrop, desktop = phone): CSSProperties {
  return {
    "--art-phone-position": `${phone.x}% ${phone.y}%`, "--art-phone-scale": phone.zoom / 100,
    "--art-desktop-position": `${desktop.x}% ${desktop.y}%`, "--art-desktop-scale": desktop.zoom / 100,
  } as CSSProperties;
}
