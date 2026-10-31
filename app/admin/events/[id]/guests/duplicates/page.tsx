import { notFound, redirect } from "next/navigation";
import { isHostAuthenticated } from "../../../../../../lib/server/host-access";
import { getAdminGuestEvent } from "../../../../../../lib/server/admin-event-guests";
import { listPossibleDuplicateRsvps } from "../../../../../../lib/server/rsvp-duplicates";
import { ContentShell } from "../../../../../../components/admin/content-shell";
import { DuplicateRsvpPanel } from "../../../../../../components/admin/duplicate-rsvp-panel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Review duplicate RSVPs | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function EventDuplicateRsvpsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  let resolved;
  try { resolved = await getAdminGuestEvent(id); }
  catch { return <ContentShell title="Duplicate review couldn’t load" description="Please check your host session and try again." dashboardHref="/admin/events">{null}</ContentShell>; }
  if (!resolved) notFound();
  const review = await listPossibleDuplicateRsvps(resolved.scope).catch(() => null);
  const guestsHref = `/admin/events/${id}/guests`;
  return <ContentShell title="Possible duplicate RSVPs" contextLabel={resolved.event.title} dashboardHref={guestsHref} description="Compare matching names, then keep the latest response or confirm they are different guests.">
    {review ? <DuplicateRsvpPanel initial={review} timeZone={resolved.event.timeZone} slug={resolved.scope.slug} guestsHref={guestsHref} /> : <p role="alert">Duplicate review couldn’t load. Please check your host session and try again.</p>}
  </ContentShell>;
}
