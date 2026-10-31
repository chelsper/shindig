import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "../../../../lib/server/admin-session";
import { listPossibleDuplicateRsvps } from "../../../../lib/server/rsvp-duplicates";
import { getEventConfiguration } from "../../../../lib/server/invitation-settings";
import { ContentShell } from "../../../../components/admin/content-shell";
import { DuplicateRsvpPanel } from "../../../../components/admin/duplicate-rsvp-panel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Review duplicate RSVPs | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function DuplicateRsvpsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const result = await Promise.all([listPossibleDuplicateRsvps(), getEventConfiguration()]).catch(() => null);
  return <ContentShell title="Possible duplicate RSVPs" description="Compare matching names, then keep the latest response or confirm they are different guests.">
    {result ? <DuplicateRsvpPanel initial={result[0]} timeZone={result[1].timeZone} guestsHref="/admin" /> : <p role="alert">Duplicate review couldn’t load. Please check your host session and try again.</p>}
  </ContentShell>;
}
