"use server";

import { saveRsvp, type SavedRsvp } from "../lib/server/rsvps";
import { isValidRsvpEditToken } from "../lib/rsvp-edit-token";
import { hashRsvpEditToken } from "../lib/server/rsvp-edit-token";
import { validateRsvpSubmission } from "../lib/server/rsvp-validation";

export type SubmitRsvpResult =
  | {
      ok: true;
      persisted: boolean;
      rsvp: SavedRsvp;
      editToken: string | null;
    }
  | { ok: false; message: string };

export async function submitRsvp(input: unknown): Promise<SubmitRsvpResult> {
  const validation = validateRsvpSubmission(input);

  if (!validation.success) {
    return { ok: false, message: validation.message };
  }

  const editToken =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).editToken
      : undefined;

  if (!isValidRsvpEditToken(editToken)) {
    return { ok: false, message: "Please refresh the page and try again." };
  }

  try {
    const result = await saveRsvp(
      validation.data,
      hashRsvpEditToken(editToken),
    );

    if (result.status === "disabled") {
      if (process.env.NODE_ENV === "development") {
        console.warn("RSVP persistence is disabled because DATABASE_URL is not set.");
        return {
          ok: true,
          persisted: false,
          editToken: null,
          rsvp: {
            id: validation.data.id,
            guestName: validation.data.guestName,
            attending: validation.data.attending,
            partySize: validation.data.partySize,
            comment: validation.data.comment,
          },
        };
      }

      return {
        ok: false,
        message: "RSVPs are temporarily unavailable. Please try again later.",
      };
    }

    return {
      ok: true,
      persisted: true,
      rsvp: result.rsvp,
      editToken,
    };
  } catch (error) {
    const databaseError =
      error && typeof error === "object"
        ? (error as { code?: string; name?: string })
        : {};
    console.error("RSVP persistence failed.", {
      code: databaseError.code ?? "unknown",
      name: databaseError.name ?? "unknown",
    });

    return {
      ok: false,
      message: "We couldn’t save your RSVP. Please try again in a moment.",
    };
  }
}
