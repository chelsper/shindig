import { validArtworkSignature, validateArtworkDimensions, validateArtworkFile, type LocalArtwork } from "./design-artwork";

function decodeArtwork(url: string, signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
      if (error) reject(error);
      else resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    const abort = () => finish(new DOMException("Image selection cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("That image took too long to open. Try a smaller image.")), 15_000);
    image.onload = () => finish();
    image.onerror = () => finish(new Error("We couldn’t open that image. Try another JPG, PNG, or WebP."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    image.decoding = "async";
    image.src = url;
  });
}

// Browser-only object URLs: never uploaded, proxied through Next/Image, or
// persisted. The caller owns a successful URL and must revoke it when done.
export async function loadLocalArtwork(file: File, signal: AbortSignal): Promise<LocalArtwork> {
  validateArtworkFile(file);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (signal.aborted) throw new DOMException("Image selection cancelled", "AbortError");
  if (!validArtworkSignature(file.type, bytes)) throw new Error("That file doesn’t appear to be a valid JPG, PNG, or WebP. Please choose another image.");
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await decodeArtwork(url, signal);
    if (signal.aborted) throw new DOMException("Image selection cancelled", "AbortError");
    validateArtworkDimensions(dimensions.width, dimensions.height);
    return { url, name: file.name, ...dimensions };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
