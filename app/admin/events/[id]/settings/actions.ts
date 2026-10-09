"use server";
import { revalidatePath } from "next/cache";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { saveDraftSettingsRecord } from "../../../../../lib/server/event-draft-settings";
import { isDraftId, isDraftRevision } from "../../../../../lib/event-drafts";
import { validateDraftSettings } from "../../../../../lib/event-draft-settings";

export async function saveDraftSettings(input: unknown): Promise<{ ok: true; revision: number } | { ok: false; message: string; conflict?: boolean }> {
  if (!(await isHostAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before saving." };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please check the RSVP and Event Hub settings." };
  const row = input as Record<string, unknown>;
  if (!isDraftId(row.id) || !isDraftRevision(row.revision)) return { ok: false, message: "Please reopen the settings editor." };
  const parsed = validateDraftSettings(row.settings);
  if (!parsed.ok) return parsed;
  try {
    const revision = await saveDraftSettingsRecord(row.id, row.revision, parsed.settings);
    if (revision === null) return { ok: false, conflict: true, message: "These settings changed or the draft is no longer available. Reopen the saved settings before editing again." };
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${row.id}`, "layout");
    return { ok: true, revision };
  } catch {
    console.error("Draft settings save could not be confirmed.");
    return { ok: false, message: "We couldn’t confirm the save. Your choices are still here; please try again." };
  }
}
