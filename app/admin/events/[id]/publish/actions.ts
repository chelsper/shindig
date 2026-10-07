"use server";
import { revalidatePath } from "next/cache";
import { publishEventRecord, changeEventLifecycleRecord } from "../../../../../lib/server/event-publications";
import { draftEventSlug, eventPaths } from "../../../../../lib/event-routes";
import type { PublicationVersions } from "../../../../../lib/event-publication";
import { isLifecycleAction, type LifecycleAction } from "../../../../../lib/event-lifecycle";

function refreshEvent(id: string) {
  const paths = eventPaths(draftEventSlug(id));
  revalidatePath(paths.invitation, "layout");
  revalidatePath(paths.hub);
  revalidatePath(`/admin/events/${id}`, "layout");
  revalidatePath("/admin/events");
}

export async function changeEventLifecycle(id: string, revision: number, action: LifecycleAction, confirmed: boolean) {
  if (confirmed !== true || !isLifecycleAction(action)) return { ok: false as const, message: "Please confirm the event change first." };
  try {
    if (!await changeEventLifecycleRecord(id, revision, action)) return { ok: false as const, message: "This event changed since you opened it. Refresh to see its current status before trying again." };
    refreshEvent(id);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "The change couldn’t be confirmed. Refresh to check the current status, then try again. Your event and guest data have not been deleted." };
  }
}

export async function publishEvent(id: string, versions: PublicationVersions, coordinates: unknown, confirmed: boolean) {
  if (confirmed !== true) return { ok: false as const, message: "Confirm you’re ready to make these details public." };
  try {
    const revision = await publishEventRecord(id, versions, coordinates);
    if (!revision) return { ok: false as const, message: "This event changed since your review. Refresh and review the latest saved version before publishing." };
    refreshEvent(id);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "The event couldn’t publish. Check that details, end time, settings and artwork are saved, then try again. Nothing was automatically made public." };
  }
}
