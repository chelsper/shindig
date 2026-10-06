import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { isAdminAuthenticated } from "../../lib/server/admin-session";
import { getAdminGuestEvent } from "../../lib/server/admin-event-guests";
import { getRsvpForAdmin } from "../../lib/server/rsvps";
import { isDraftId } from "../../lib/event-drafts";
import { eventGuestsPath } from "../../lib/admin-guests";
import { AdminGuestForm } from "./admin-guest-form";
import { ContentShell } from "./content-shell";

export async function EventGuestEditorPage({ id, guestId }: { id: string; guestId?: string }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  if (!isDraftId(id) || (guestId !== undefined && !isDraftId(guestId))) notFound();
  let resolved, rsvp;
  try {
    resolved = await getAdminGuestEvent(id);
    if (resolved && guestId) rsvp = await getRsvpForAdmin(guestId, resolved.scope);
  } catch {
    return <ContentShell title="Guest details couldn’t load" contextLabel="Guest management" description="Please refresh and try again. No guest information has changed." dashboardHref={eventGuestsPath(id)}>{null}</ContentShell>;
  }
  if (!resolved || (guestId && !rsvp)) notFound();
  const event = { id, title: resolved.event.title, ...resolved.scope.rsvp, guestListEnabled: resolved.scope.features.guestList, requestId: randomUUID() };
  return rsvp ? <AdminGuestForm mode="edit" rsvp={rsvp} event={event} /> : <AdminGuestForm mode="create" event={event} />;
}
