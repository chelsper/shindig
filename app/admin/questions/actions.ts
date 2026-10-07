"use server";

import { revalidatePath } from "next/cache";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { isContentId, validateHostAnswer } from "../../../lib/server/event-content-validation";
import { removeQuestion, saveQuestionAnswer } from "../../../lib/server/questions";
import type { HostContentResult } from "../updates/actions";
import { hostScopeArgs, refreshHostEvent } from "../../../lib/server/host-event";

function refreshQuestions() {
  revalidatePath("/admin/questions");
  revalidatePath(OYSTER_ROAST_EVENT.eventHub.path);
}

export async function answerGuestQuestion(id: string, input: unknown, eventSlug?: string): Promise<HostContentResult> {
  if (!(await isAdminAuthenticated())) return { ok: false, message: "Your host session has expired. Please sign in again." };
  if (!isContentId(id)) return { ok: false, message: "That question could not be found." };
  const validation = validateHostAnswer(input);
  if (!validation.success) return { ok: false, message: validation.message };
  try {
    if (!(await saveQuestionAnswer(id, validation.data, ...await hostScopeArgs(eventSlug)))) return { ok: false, message: "That question could not be found." };
    await refreshHostEvent(eventSlug);
  } catch {
    console.error("Host answer update failed.");
    return { ok: false, message: "We couldn’t save your answer. Please try again." };
  }
  refreshQuestions();
  return { ok: true };
}

export async function deleteGuestQuestion(id: string, confirmed: boolean, eventSlug?: string): Promise<HostContentResult> {
  if (!(await isAdminAuthenticated())) return { ok: false, message: "Your host session has expired. Please sign in again." };
  if (!isContentId(id) || confirmed !== true) return { ok: false, message: "Please confirm which question to delete." };
  try {
    await removeQuestion(id, ...await hostScopeArgs(eventSlug));
    await refreshHostEvent(eventSlug);
  } catch {
    console.error("Host question deletion failed.");
    return { ok: false, message: "We couldn’t delete that question. Please try again." };
  }
  refreshQuestions();
  return { ok: true };
}
