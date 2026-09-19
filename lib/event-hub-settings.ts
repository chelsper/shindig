import { OYSTER_ROAST_EVENT } from "./oyster-roast-event";

export type EventHubHeaderSettings = {
  imageUrl: string;
  imageAlt: string;
  focalX: number;
  focalY: number;
  zoomPercent: number;
};

export const DEFAULT_EVENT_HUB_HEADER: EventHubHeaderSettings = {
  imageUrl: OYSTER_ROAST_EVENT.eventHub.headerImage.url,
  imageAlt: OYSTER_ROAST_EVENT.eventHub.headerImage.alt,
  focalX: OYSTER_ROAST_EVENT.eventHub.headerImage.focalX,
  focalY: OYSTER_ROAST_EVENT.eventHub.headerImage.focalY,
  zoomPercent: OYSTER_ROAST_EVENT.eventHub.headerImage.zoomPercent,
};

type HeaderValidationResult =
  | { success: true; data: EventHubHeaderSettings }
  | { success: false; message: string };

function isAllowedImageUrl(value: string) {
  if (value === DEFAULT_EVENT_HUB_HEADER.imageUrl) return true;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith("/event-hub/")
    );
  } catch {
    return false;
  }
}

function parseBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export function validateEventHubHeaderSettings(
  input: unknown,
): HeaderValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Please check the header settings." };
  }

  const settings = input as Record<string, unknown>;
  const imageUrl =
    typeof settings.imageUrl === "string" ? settings.imageUrl.trim() : "";
  const imageAlt =
    typeof settings.imageAlt === "string" ? settings.imageAlt.trim() : "";
  const focalX = parseBoundedInteger(settings.focalX, 0, 100);
  const focalY = parseBoundedInteger(settings.focalY, 0, 100);
  const zoomPercent = parseBoundedInteger(settings.zoomPercent, 100, 200);

  if (!imageUrl || imageUrl.length > 2_048 || !isAllowedImageUrl(imageUrl)) {
    return { success: false, message: "Please upload a valid header image." };
  }

  if (!imageAlt || imageAlt.length > 180) {
    return {
      success: false,
      message: "Please add a short image description for accessibility.",
    };
  }

  if (focalX === null || focalY === null || zoomPercent === null) {
    return { success: false, message: "Please check the image position and zoom." };
  }

  return {
    success: true,
    data: { imageUrl, imageAlt, focalX, focalY, zoomPercent },
  };
}
