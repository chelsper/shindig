import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listHostContacts } from "../../../lib/server/rsvp-contacts";
import { getEventConfiguration } from "../../../lib/server/invitation-settings";
import { ContentShell } from "../../../components/admin/content-shell";
import { HostContactsPanel } from "../../../components/admin/host-contacts";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private contacts | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function ContactsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const result = await Promise.all([listHostContacts(), getEventConfiguration()]).catch(() => null);
  return <ContentShell title="Private contacts" description="Guests who chose to hear from you about this event. Copy details to use in your own apps; nothing is sent by Shindig.">
    {result ? <HostContactsPanel initial={result[0]} title={result[1].title} /> : <p role="alert">Contacts couldn’t load. Please refresh and try again.</p>}
  </ContentShell>;
}
