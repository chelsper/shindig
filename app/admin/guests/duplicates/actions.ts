"use server";
import { revalidatePath } from "next/cache";
import { hostScopeArgs, refreshHostEvent } from "../../../../lib/server/host-event";
import { decideRsvpDuplicate, listPossibleDuplicateRsvps } from "../../../../lib/server/rsvp-duplicates";
import { DuplicateReviewError, type DuplicateReview } from "../../../../lib/rsvp-duplicates";

export type DuplicateResult = { ok: true; data: DuplicateReview; message?: string } | { ok: false; message: string };
export async function refreshDuplicateReview(slug?: string): Promise<DuplicateResult> {
  try { return { ok: true, data: await listPossibleDuplicateRsvps(...await hostScopeArgs(slug)) }; }
  catch { return { ok: false, message: "Duplicate review couldn’t load. Check your host session and try again." }; }
}
export async function reviewDuplicateRsvp(input: unknown, slug?: string): Promise<DuplicateResult> {
  let status: string;
  try {
    const args = await hostScopeArgs(slug);
    status = await decideRsvpDuplicate(input, ...args);
    revalidatePath("/admin", "layout");
    revalidatePath("/event");
    revalidatePath("/rsvp/[token]", "page");
    await refreshHostEvent(slug);
    if (slug?.startsWith("event-")) revalidatePath(`/e/${slug}`, "layout");
    return { ok: true, data: await listPossibleDuplicateRsvps(...args), message: status === "merged" ? "Merged. The latest response is kept and attendance totals are updated." : "Kept separate. We’ll only flag this pair again if their records change." };
  } catch (error) {
    return { ok: false, message: error instanceof DuplicateReviewError ? error.message : "The review couldn’t be completed. Check your host session and refresh before retrying." };
  }
}
