"use server";

import { saveRsvp } from "../lib/server/rsvps";
import { validateRsvpSubmission } from "../lib/server/rsvp-validation";

export type SubmitRsvpResult =
  | { ok: true; persisted: boolean }
  | { ok: false; message: string };

export async function submitRsvp(input: unknown): Promise<SubmitRsvpResult> {
  const validation = validateRsvpSubmission(input);

  if (!validation.success) {
    return { ok: false, message: validation.message };
  }

  try {
    const result = await saveRsvp(validation.data);

    if (result === "disabled") {
      if (process.env.NODE_ENV === "development") {
        console.warn("RSVP persistence is disabled because DATABASE_URL is not set.");
        return { ok: true, persisted: false };
      }

      return {
        ok: false,
        message: "RSVPs are temporarily unavailable. Please try again later.",
      };
    }

    return { ok: true, persisted: true };
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
