import Link from "next/link";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { getHostPrincipal } from "../../../lib/server/host-access";
import { listPendingEventDeletions } from "../../../lib/server/event-deletion";
import { SHINDIG_BUSINESS } from "../../../lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account & Privacy | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";
export default async function HostAccountPage() {
  const principal = await getHostPrincipal();
  if (!principal) redirect("/host/sign-in");
  const pending = await listPendingEventDeletions().catch(() => null);
  return <ContentShell title="Account & Privacy" contextLabel="Your information" dashboardHref="/admin/events" description="A clear place to manage event data and get help with your account.">
    <div className="space-y-6 pb-10 text-sm leading-7">
      <section className="rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 p-5 sm:p-7"><h2 className="font-serif text-2xl">{principal.ownerId ? "Your host account" : "Site administrator"}</h2><p className="mt-3 break-words">{principal.email ?? "You’re using the separate password-protected workspace, not a Google host account."}</p><p className="mt-3">These controls only apply to your own events. Other hosts’ records are not accessible here.</p></section>
      <section className="rounded-3xl border border-[#202523]/12 bg-[#fffaf1] p-5 sm:p-7"><h2 className="font-serif text-2xl">Keep, archive, or remove an event</h2><p className="mt-3">Archiving keeps your records and lets you restore the event later. Permanent deletion removes its active database records and disables guest links. Open an event’s Overview, then Data &amp; privacy to review exports and deletion.</p><Link href="/admin/events" className={`${link} mt-2`}>Choose one of your events →</Link><p className="mt-3 text-xs leading-6">Provider backups and security logs may remain after active records are removed. Exported files, saved calendar entries, and copies guests or hosts keep elsewhere are outside Shindig’s deletion controls. Jasper Shucks’ original invitation is managed separately and is not deleted by this flow.</p></section>
      {pending === null ? <p role="alert" className="rounded-2xl bg-[#fff4d8] p-5">Artwork cleanup status couldn’t load. Refresh this page to check again; no deletion was performed.</p> : pending.length > 0 && <section className="rounded-3xl border border-[#b78228]/25 bg-[#fff4d8] p-5 sm:p-7"><h2 className="font-serif text-2xl">Finish artwork cleanup</h2><p className="mt-3">These events’ database records are deleted. Their private artwork still needs a cleanup check. Allow three minutes after deletion, then open each receipt to finish.</p><ul className="mt-3 divide-y divide-[#202523]/15">{pending.map(item => <li key={item.id}><Link href={`/admin/events/${item.id}/privacy`} className={link}>Deleted event · {new Date(item.deletedAt).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })} · Check cleanup →</Link></li>)}</ul></section>}
      <section className="rounded-3xl border border-[#202523]/12 bg-[#fffaf1] p-5 sm:p-7"><h2 className="font-serif text-2xl">{principal.ownerId ? "Request account deletion" : "Need help with your data?"}</h2><p className="mt-3">Account closure is reviewed manually. Email support from the address associated with your account and tell us what you want removed. We’ll verify ownership and clarify any limitations before acting. Opening this link does not send a request or delete anything.</p><a href={`mailto:${SHINDIG_BUSINESS.supportEmail}?subject=${encodeURIComponent("Shindig account and data request")}`} className={`${link} mt-2 break-all`}>{SHINDIG_BUSINESS.supportEmail}</a><p className="mt-3 text-xs leading-6">Never include passwords, verification codes, private edit links, or guest lists. Disconnecting Google does not delete your Shindig account or event data.</p></section>
      <div className="flex flex-wrap gap-x-6"><Link href="/privacy" className={link}>Privacy policy</Link><Link href="/support" className={link}>Support</Link></div>
    </div>
  </ContentShell>;
}
