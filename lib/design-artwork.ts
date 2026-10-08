import type { DesignPreviewDevice, DesignPreviewPage } from "./design-preview";

export type ArtworkCrop = { x: number; y: number; zoom: number };
export type ArtworkCrops = Record<DesignPreviewPage, ArtworkCrop>;
export type LocalArtwork = { url: string; name: string; width: number; height: number };
export const ARTWORK_FILE_LIMIT = 10 * 1024 * 1024;
export const ARTWORK_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ARTWORK_ZOOM_MAX = 250;
export function defaultArtworkCrop(): ArtworkCrop { return { x: 50, y: 50, zoom: 100 }; }
export function defaultArtworkCrops(): ArtworkCrops { return { invitation: defaultArtworkCrop(), hub: defaultArtworkCrop() }; }
function clamp(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}
export function normalizeArtworkCrop(crop: ArtworkCrop): ArtworkCrop {
  return { x: clamp(crop.x, 0, 100, 50), y: clamp(crop.y, 0, 100, 50), zoom: clamp(crop.zoom, 100, ARTWORK_ZOOM_MAX, 100) };
}
export function replaceArtworkCrop(crops: ArtworkCrops, page: DesignPreviewPage, crop: ArtworkCrop): ArtworkCrops {
  return { ...crops, [page]: normalizeArtworkCrop(crop) };
}
export function artworkAspect(page: DesignPreviewPage, device: DesignPreviewDevice) {
  return page === "invitation" ? 4 / 5 : device === "phone" ? 16 / 9 : 3;
}
// Cover + zoom, anchored to the selected percentage. Used for dragging and to
// check the same bounds implemented by object-position + transform-origin.
export function artworkPlacement(image: Pick<LocalArtwork, "width" | "height">, frame: { width: number; height: number }, crop: ArtworkCrop) {
  const normalized = normalizeArtworkCrop(crop);
  const scale = Math.max(frame.width / image.width, frame.height / image.height) * normalized.zoom / 100;
  const width = image.width * scale, height = image.height * scale;
  return { width, height, left: -(width - frame.width) * normalized.x / 100, top: -(height - frame.height) * normalized.y / 100 };
}
export function dragArtworkCrop(crop: ArtworkCrop, image: Pick<LocalArtwork, "width" | "height">, frame: { width: number; height: number }, dx: number, dy: number): ArtworkCrop {
  const placement = artworkPlacement(image, frame, crop);
  const overflowX = placement.width - frame.width, overflowY = placement.height - frame.height;
  return normalizeArtworkCrop({ ...crop, x: overflowX > .01 ? crop.x - dx / overflowX * 100 : crop.x, y: overflowY > .01 ? crop.y - dy / overflowY * 100 : crop.y });
}
export function artworkImageStyle(crop: ArtworkCrop) {
  const { x, y, zoom } = normalizeArtworkCrop(crop);
  return { objectPosition: `${x}% ${y}%`, transformOrigin: `${x}% ${y}%`, transform: `scale(${zoom / 100})` };
}
export function validateArtworkFile(file: Pick<File, "type" | "size">) {
  if (!(ARTWORK_TYPES as readonly string[]).includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image. Export HEIC or other formats first.");
  if (file.size <= 0 || file.size > ARTWORK_FILE_LIMIT) throw new Error("Choose an image smaller than 10 MB that isn’t empty.");
}
export function validArtworkSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
export function validateArtworkDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16000 || height > 16000 || width * height > 40_000_000) {
    throw new Error("This image is too large to preview. Resize it to 40 megapixels or less, with each side under 16,000 pixels.");
  }
}
