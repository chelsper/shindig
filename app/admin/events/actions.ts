"use server";

import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { saveEventDraftRecord } from "../../../lib/server/event-drafts";
import { isDraftId, isDraftRevision, validateDraftForm } from "../../../lib/event-drafts";

export type SaveDraftResult = { ok: true; id: string; revision: number } | { ok: false; message: string; conflict?: boolean };

export async function saveEventDraft(input: unknown): Promise<SaveDraftResult> {
  if (!(await isAdminAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before saving." };
  if (!input || typeof input !== "object") return { ok: false, message: "Please check the event details." };
  const row = input as Record<string, unknown>;
  if (!isDraftId(row.id) || !isDraftRevision(row.revision)) return { ok: false, message: "Please reopen the draft editor before saving." };
  const result = validateDraftForm(row.fields);
  if (!result.ok) return result;
  try {
    const saved = await saveEventDraftRecord(row.id, row.revision, result.fields);
    if (!saved) return { ok: false, conflict: true, message: "This draft has changed or is no longer available. Reopen the saved draft before making more changes." };
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${saved.id}`, "layout");
    return { ok: true, ...saved };
  } catch {
    console.error("Event draft save could not be confirmed.");
    return { ok: false, message: "We couldn’t confirm your draft was saved. Your changes are still here; please try again shortly." };
  }
}
