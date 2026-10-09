"use server";
import { revalidatePath } from "next/cache";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { saveDraftArtworkRecord } from "../../../../../lib/server/event-draft-artwork";
import { isDraftId, isDraftRevision } from "../../../../../lib/event-drafts";
import { validateDraftArtwork } from "../../../../../lib/event-draft-artwork";

export async function saveDraftArtwork(input: unknown): Promise<{ ok: true; revision: number } | { ok: false; message: string; conflict?: boolean }> {
  if (!(await isHostAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before saving." };
  if (!input || typeof input !== "object") return { ok: false, message: "Please check the artwork settings." };
  const row = input as Record<string, unknown>;
  if (!isDraftId(row.id) || !isDraftRevision(row.revision)) return { ok: false, message: "Please reopen the artwork editor." };
  const parsed = validateDraftArtwork(row.id, row.settings);
  if (!parsed.ok) return parsed;
  try {
    const revision = await saveDraftArtworkRecord(row.id, row.revision, parsed.settings);
    if (revision === null) return { ok: false, conflict: true, message: "This draft’s artwork changed. Reopen the editor before saving again." };
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${row.id}`, "layout");
    return { ok: true, revision };
  } catch {
    console.error("Draft artwork save could not be confirmed.");
    return { ok: false, message: "We couldn’t confirm the save. Your changes are still here; please try again." };
  }
}
