"use server";
import { revalidatePath } from "next/cache";
import { publishEventRecord, changeEventLifecycleRecord, getHostEventPublication, isEventAliasAvailable } from "../../../../../lib/server/event-publications";
import { EventAliasError } from "../../../../../lib/event-alias";
import { draftEventSlug, eventPaths } from "../../../../../lib/event-routes";
import type { PublicationVersions } from "../../../../../lib/event-publication";
import { isLifecycleAction, type LifecycleAction } from "../../../../../lib/event-lifecycle";
import { RsvpAdmissionError } from "../../../../../lib/rsvp-policy";

async function refreshEvent(id: string) {
  const paths = eventPaths(draftEventSlug(id));
  revalidatePath(paths.invitation, "layout");
  revalidatePath(paths.hub);
  const publication = await getHostEventPublication(draftEventSlug(id));
  if (publication?.publicAlias) {
    const friendly = eventPaths(publication.publicAlias);
    revalidatePath(friendly.invitation, "layout");
    revalidatePath(friendly.hub);
  }
  revalidatePath(`/admin/events/${id}`, "layout");
  revalidatePath("/admin/events");
}

export async function changeEventLifecycle(id: string, revision: number, action: LifecycleAction, confirmed: boolean) {
  if (confirmed !== true || !isLifecycleAction(action)) return { ok: false as const, message: "Please confirm the event change first." };
  try {
    if (!await changeEventLifecycleRecord(id, revision, action)) return { ok: false as const, message: "This event changed since you opened it. Refresh to see its current status before trying again." };
    await refreshEvent(id);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "The change couldn’t be confirmed. Refresh to check the current status, then try again. Your event and guest data have not been deleted." };
  }
}

export async function checkEventLink(id: string, alias: unknown) {
  try { return { ok: true as const, available: await isEventAliasAvailable(id, alias) }; }
  catch (error) { return { ok: false as const, message: error instanceof EventAliasError ? error.message : "Link availability couldn’t be checked. Please refresh or try again." }; }
}

export async function publishEvent(id: string, versions: PublicationVersions, coordinates: unknown, confirmed: boolean, alias?: unknown) {
  if (confirmed !== true) return { ok: false as const, message: "Confirm you’re ready to make these details public." };
  try {
    const revision = await publishEventRecord(id, versions, coordinates, alias);
    if (!revision) return { ok: false as const, message: "This event changed since your review. Refresh and review the latest saved version before publishing." };
    await refreshEvent(id);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof EventAliasError || error instanceof RsvpAdmissionError) return { ok: false as const, message: error.message };
    return { ok: false as const, message: "Publishing couldn’t be confirmed. Refresh this review to check the current status before trying again. No invitations or messages were sent." };
  }
}
