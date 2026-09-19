"use server";

import { isValidRsvpEditToken } from "../../lib/rsvp-edit-token";
import { hashRsvpEditToken } from "../../lib/server/rsvp-edit-token";
import {
  updateRsvpForGuest,
  type GuestRsvp,
} from "../../lib/server/rsvps";
import { validateRsvpUpdate } from "../../lib/server/rsvp-validation";

export type UpdateRsvpResult =
  | { ok: true; rsvp: GuestRsvp }
  | { ok: false; message: string };

export async function updateRsvp(input: unknown): Promise<UpdateRsvpResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Please check your response and try again." };
  }

  const update = input as Record<string, unknown>;

  if (!isValidRsvpEditToken(update.editToken)) {
    return {
      ok: false,
      message: "This private update link is no longer available.",
    };
  }

  const validation = validateRsvpUpdate(update);

  if (!validation.success) {
    return { ok: false, message: validation.message };
  }

  try {
    const rsvp = await updateRsvpForGuest(
      hashRsvpEditToken(update.editToken),
      validation.data,
    );

    if (!rsvp) {
      return {
        ok: false,
        message: "This private update link is no longer available.",
      };
    }

    return { ok: true, rsvp };
  } catch (error) {
    const databaseError =
      error && typeof error === "object"
        ? (error as { code?: string; name?: string })
        : {};
    console.error("RSVP update failed.", {
      code: databaseError.code ?? "unknown",
      name: databaseError.name ?? "unknown",
    });

    return {
      ok: false,
      message: "We couldn’t update your RSVP. Please try again in a moment.",
    };
  }
}
