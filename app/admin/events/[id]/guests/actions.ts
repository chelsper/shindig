"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminGuestEvent } from "../../../../../lib/server/admin-event-guests";
import { createRsvpForAdmin, updateRsvpForAdmin, deleteRsvpForAdmin } from "../../../../../lib/server/rsvps";
import { validateRsvpUpdate } from "../../../../../lib/server/rsvp-validation";
import { eventGuestsPath } from "../../../../../lib/admin-guests";
import type { AdminGuestActionState } from "../../../actions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Operation = "create" | "update" | "delete";

async function mutate(operation: Operation, eventId: string, id: string, form: FormData): Promise<AdminGuestActionState> {
  let slug: string;
  let publicSlug: string | undefined;
  try {
    const resolved = await getAdminGuestEvent(eventId);
    if (!resolved) return { error: "This event isn’t available. Please return to Your events." };
    if (typeof id !== "string" || !uuid.test(id)) return { error: "Please refresh this page and try again." };
    const { scope } = resolved;
    slug = scope.slug;
    publicSlug = scope.publicSlug;
    if (operation === "delete") {
      if (form.get("confirm") !== "delete") return { error: "Please confirm that you want to delete this RSVP." };
      if (!(await deleteRsvpForAdmin(id, scope))) return { error: "That RSVP could not be found in this event. Refresh the guest list." };
    } else {
      const attendance = form.get("attending");
      if (attendance !== "true" && attendance !== "false") return { error: "Please choose an RSVP status." };
      const attending = attendance === "true";
      const party = form.get("partySize");
      const validation = validateRsvpUpdate({
        guestName: form.get("guestName"), attending,
        partySize: attending && typeof party === "string" ? Number(party) : null,
        displayOnGuestList: attending && form.get("displayOnGuestList") === "on",
        comment: form.get("comment"),
      }, { maxPartySize: scope.rsvp.maxPartySize, allowComments: true, guestListEnabled: true });
      if (!validation.success) return { error: validation.message };
      if (operation === "create") await createRsvpForAdmin(id, validation.data, scope);
      else if (!(await updateRsvpForAdmin(id, validation.data, scope))) return { error: "That RSVP could not be found in this event. Refresh the guest list." };
    }
  } catch {
    return { error: "We couldn’t save that change. Please check your host session and try again." };
  }
  // Guest-data edits are live immediately; publication still controls event setup.
  revalidatePath(`/e/${slug}`, "layout");
  if (publicSlug) revalidatePath(`/e/${publicSlug}`, "layout");
  revalidatePath(`/admin/events/${eventId}`, "layout");
  redirect(`${eventGuestsPath(eventId)}?saved=${operation}`);
}

export async function createEventGuest(eventId: string, requestId: string, _state: AdminGuestActionState, form: FormData) {
  return mutate("create", eventId, requestId, form);
}
export async function updateEventGuest(eventId: string, id: string, _state: AdminGuestActionState, form: FormData) {
  return mutate("update", eventId, id, form);
}
export async function deleteEventGuest(eventId: string, id: string, _state: AdminGuestActionState, form: FormData) {
  return mutate("delete", eventId, id, form);
}
