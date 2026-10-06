"use server";
import { revalidatePath } from "next/cache";
import { publishEventRecord } from "../../../../../lib/server/event-publications";
import { draftEventSlug, eventPaths } from "../../../../../lib/event-routes";
import type { PublicationVersions } from "../../../../../lib/event-publication";

export async function publishEvent(id: string, versions: PublicationVersions, coordinates: unknown, confirmed: boolean) {
  if (confirmed !== true) return { ok: false as const, message: "Confirm you’re ready to make these details public." };
  try {
    const revision = await publishEventRecord(id, versions, coordinates);
    if (!revision) return { ok: false as const, message: "This event changed since your review. Refresh and review the latest saved version before publishing." };
    const paths = eventPaths(draftEventSlug(id));
    for (const path of [paths.invitation, paths.hub, `/admin/events/${id}/publish`, "/admin/events"]) revalidatePath(path);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "The event couldn’t publish. Check that details, end time, settings and artwork are saved, then try again. Nothing was automatically made public." };
  }
}
