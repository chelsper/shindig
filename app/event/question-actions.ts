"use server";

import { revalidatePath } from "next/cache";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { validateGuestQuestion } from "../../lib/server/event-content-validation";
import { insertGuestQuestion } from "../../lib/server/questions";

export type QuestionSubmissionResult = { ok: true } | { ok: false; message: string };

export async function submitGuestQuestion(input: unknown): Promise<QuestionSubmissionResult> {
  if (!OYSTER_ROAST_EVENT.features.questions) {
    return { ok: false, message: "Questions aren’t available for this event right now." };
  }
  const validation = validateGuestQuestion(input);
  if (!validation.success) return { ok: false, message: validation.message };
  try {
    await insertGuestQuestion(validation.data);
  } catch {
    console.error("Guest question submission failed.");
    return { ok: false, message: "We couldn’t send your question. Please try again in a moment." };
  }
  revalidatePath("/admin/questions");
  // Acknowledgment only: no private question data or publication capability.
  return { ok: true };
}
