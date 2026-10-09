import { isDraftId } from "./event-drafts";
import { parseEventAppearance, type EventAppearance } from "./event-appearance";

export const DRAFT_IMAGE_LIMIT = 4 * 1024 * 1024;
export const DRAFT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type DraftImageKind = "invitation" | "header";
export type DraftImage = { path: string | null; alt: string };
export type DraftArtwork = {
  design?: EventAppearance;
  invitation: DraftImage;
  header: DraftImage & { focalX: number; focalY: number; zoomPercent: number };
};
export type DraftArtworkRecord = { settings: DraftArtwork; revision: number };
export const EMPTY_DRAFT_ARTWORK: DraftArtwork = {
  invitation: { path: null, alt: "" },
  header: { path: null, alt: "", focalX: 50, focalY: 50, zoomPercent: 100 },
};
export function isDraftImageKind(value: unknown): value is DraftImageKind {
  return value === "invitation" || value === "header";
}
export function isDraftImagePath(id: string, value: unknown, kind?: DraftImageKind): value is string {
  if (!isDraftId(id) || typeof value !== "string") return false;
  const parts = value.split("/");
  if (parts.length !== 4 || parts[0] !== "event-drafts" || parts[1] !== id || !isDraftImageKind(parts[2]) || (kind && parts[2] !== kind)) return false;
  const [name, extension, extra] = parts[3].split(".");
  return !extra && isDraftId(name) && /^(png|jpg|webp|avif)$/.test(extension ?? "");
}
export function draftImageUrl(id: string, path: string) {
  return `/admin/events/${id}/artwork/image?path=${encodeURIComponent(path)}`;
}
export function validateDraftArtwork(id: string, input: unknown): { ok: true; settings: DraftArtwork } | { ok: false; message: string } {
  if (!isDraftId(id) || !input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please check the artwork settings." };
  const source = input as Record<string, unknown>;
  const design = source.design === undefined ? undefined : parseEventAppearance(source.design);
  if (design === null) return { ok: false, message: "Choose an available style and valid invitation framing." };
  const images: Partial<Record<DraftImageKind, DraftImage>> = {};
  for (const kind of ["invitation", "header"] as const) {
    const image = source[kind] as Record<string, unknown> | undefined;
    if (!image || typeof image !== "object" || (image.path !== null && !isDraftImagePath(id, image.path, kind))) return { ok: false, message: "Upload artwork using this draft’s editor." };
    if (typeof image.alt !== "string" || image.alt.trim().length > 180 || /[\u0000-\u001f\u007f]/.test(image.alt) || (image.path && !image.alt.trim())) return { ok: false, message: "Add a short image description (up to 180 characters)." };
    images[kind] = { path: image.path as string | null, alt: image.path ? image.alt.trim() : "" };
  }
  const header = source.header as Record<string, unknown>;
  for (const [key, min, max] of [["focalX", 0, 100], ["focalY", 0, 100], ["zoomPercent", 100, design ? 250 : 200]] as const) {
    if (typeof header[key] !== "number" || !Number.isInteger(header[key]) || header[key] < min || header[key] > max) return { ok: false, message: "Please check the header position and zoom." };
  }
  return { ok: true, settings: {
    ...(design ? { design } : {}),
    invitation: images.invitation!,
    header: { ...images.header!, focalX: header.focalX as number, focalY: header.focalY as number, zoomPercent: header.zoomPercent as number },
  } };
}
