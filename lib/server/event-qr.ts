import "server-only";
import QRCode from "qrcode";
import { eventPaths } from "../event-routes";
import { SHINDIG_SITE } from "../site";

// Input is a server-resolved publication locator, never a caller-supplied URL.
export async function createEventQr(publicSlug: string, target: "invitation" | "hub", format: "svg" | "png") {
  const url = new URL(eventPaths(publicSlug)[target], SHINDIG_SITE.url).toString();
  const options = { errorCorrectionLevel: "M" as const, margin: 4, scale: 12, color: { dark: "#000000ff", light: "#ffffffff" } };
  if (format === "svg") return QRCode.toString(url, { ...options, type: "svg" });
  const image = await QRCode.toDataURL(url, { ...options, type: "image/png" });
  return new Uint8Array(Buffer.from(image.slice("data:image/png;base64,".length), "base64"));
}
