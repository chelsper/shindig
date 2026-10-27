"use server";
import { revalidatePath } from "next/cache";
import { cleanupDeletedEventArtwork, deleteOwnedEvent } from "../../../../../lib/server/event-deletion";
import { parseDeletionInput, type DeletionResult } from "../../../../../lib/event-deletion";

function refresh() {
  // Every guest page/image re-resolves publication; invalidate stale navigations
  // on both stable and friendly URLs as well as the host's lists.
  revalidatePath("/e/[slug]", "layout");
  revalidatePath("/admin/events", "layout");
  revalidatePath("/host/account");
}
export async function deleteEvent(value: unknown): Promise<DeletionResult> {
  if (!parseDeletionInput(value)) return { ok: false, message: "Type DELETE and confirm that you understand what will be removed." };
  try {
    const result = await deleteOwnedEvent(value);
    if (result === "stale") return { ok: false, message: "This event changed since you opened this page. Refresh and review it again before deleting." };
    if (result === "missing") return { ok: false, message: "This event is unavailable. Return to your events and check its current status." };
    refresh();
    return { ok: true, receipt: result };
  } catch {
    // A network failure may follow a committed transaction. Never assert either
    // success or that data is intact without a verified receipt.
    return { ok: false, message: "We couldn’t confirm deletion. Refresh this page to check the current status before trying again." };
  }
}
export async function finishArtworkCleanup(id: string): Promise<DeletionResult> {
  try {
    const result = await cleanupDeletedEventArtwork(id);
    if (!result) return { ok: false, message: "This cleanup request is unavailable." };
    refresh();
    return { ok: true, receipt: result };
  } catch {
    return { ok: false, message: "Artwork cleanup couldn’t be confirmed. Refresh to check the deletion receipt, then retry or contact support." };
  }
}
