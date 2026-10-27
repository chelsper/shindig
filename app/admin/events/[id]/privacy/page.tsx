import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventDeletionControls } from "../../../../../components/admin/event-deletion-controls";
import { getHostPrincipal } from "../../../../../lib/server/host-access";
import { getEventDeletionReceipt, getEventDeletionReview } from "../../../../../lib/server/event-deletion";
import { isDraftId } from "../../../../../lib/event-drafts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Event Data & Privacy | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
export default async function EventPrivacyPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getHostPrincipal())) redirect("/host/sign-in");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let data;
  try { data = await Promise.all([getEventDeletionReview(id), getEventDeletionReceipt(id)]); }
  catch { return <ContentShell title="Event privacy couldn’t load" contextLabel="Data & privacy" dashboardHref="/admin/events" description="We couldn’t check the event’s current status. Nothing has been changed by opening this page. Please try again or contact support."><Link href="/host/account" className={link}>Account &amp; Privacy →</Link></ContentShell>; }
  const [review, receipt] = data;
  if (!review && !receipt) notFound();
  return <ContentShell title="Your event, your data." contextLabel="Data & privacy" dashboardHref={review ? `/admin/events/${id}/setup` : "/admin/events"} description="Keep the memories you need. Remove information you no longer want to store.">
    {review && <section className="mb-6 space-y-4 rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 p-5 text-sm leading-7 sm:p-7">
      <h2 className="font-serif text-2xl">Archive or delete?</h2>
      <p><strong>Archive</strong> takes a published event offline and keeps its details and guest records so you can restore it later. It does not delete data. <strong>Delete</strong> permanently removes this event’s active records and disables its links.</p>
      <div className="flex flex-wrap gap-x-5"><Link href={`/admin/events/${id}/publish`} className={link}>{review.publication ? "Review archive controls →" : "Back to event review →"}</Link><Link href="/host/account" className={link}>Account &amp; Privacy →</Link></div>
      <h3 className="font-semibold">Save what you need first</h3>
      {review.publication > 0 ? <><a href={`/admin/events/${id}/guests/export`} className={link}>Download RSVP CSV</a><p className="text-xs leading-6">Includes guest names, responses, party sizes, comments, and dates. It is not a full event backup and excludes optional phone/email sharing and the invitation tracker. Keep any download private; deleting the event cannot remove copies you save.</p></> : <p>No RSVP export is available before this event’s first publication.</p>}
    </section>}
    <EventDeletionControls review={review} initialReceipt={receipt} />
  </ContentShell>;
}
