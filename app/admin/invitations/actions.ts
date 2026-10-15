"use server";
import { revalidatePath } from "next/cache";
import { hostScopeArgs } from "../../../lib/server/host-event";
import { changeInvitationRecord, InvitationTrackerError, listInvitationTracker } from "../../../lib/server/invitation-tracker";
import type { InvitationTracker } from "../../../lib/invitation-tracker";

export type TrackerResult = { ok: true; data: InvitationTracker } | { ok: false; message: string };
export async function refreshInvitationTracker(slug?: string): Promise<TrackerResult> {
  try { return { ok: true, data: await listInvitationTracker(...await hostScopeArgs(slug)) }; }
  catch { return { ok: false, message: "The tracker couldn’t load. Check your host session and try again." }; }
}
export async function changeInvitation(input: unknown, slug?: string): Promise<TrackerResult> {
  try {
    const args = await hostScopeArgs(slug);
    await changeInvitationRecord(input, ...args);
    // Nothing about this private list changes a guest-facing page.
    revalidatePath("/admin/invitations");
    if (slug?.startsWith("event-")) revalidatePath(`/admin/events/${slug.slice(6)}/invitations`);
    return { ok: true, data: await listInvitationTracker(...args) };
  } catch (error) {
    return { ok: false, message: error instanceof InvitationTrackerError ? error.message : "The change couldn’t be completed. Check your host session and refresh the tracker before retrying." };
  }
}
