import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { HostEventList } from "../../../components/admin/host-event-list";
import { getHostPrincipal } from "../../../lib/server/host-access";
import { HostAccountButton } from "../../../components/admin/host-account-button";
import { logoutAdmin } from "../actions";
import { listHostEventCards } from "../../../lib/server/event-dashboard";
import { getEventConfiguration } from "../../../lib/server/invitation-settings";
import { legacyEventCard } from "../../../lib/event-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Events | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AdminEventsPage({ searchParams }: { searchParams?: Promise<{ view?: string | string[] }> }) {
  const principal = await getHostPrincipal();
  if (!principal) redirect("/host/sign-in");
  const showLegacy = principal.ownerId === null;
  const archivedView = (await searchParams)?.view === "archived";
  const [cards, legacy] = await Promise.all([
    listHostEventCards().catch(() => null),
    showLegacy && !archivedView ? getEventConfiguration().then(legacyEventCard).catch(() => null) : Promise.resolve(null),
  ]);
  const archivedCount = cards?.filter(({ status }) => status === "archived").length;
  const visibleCards = cards?.filter(({ status }) => archivedView ? status === "archived" : status !== "archived");
  const events = visibleCards ? [...(!archivedView && legacy ? [legacy] : []), ...visibleCards] : null;
  return <ContentShell title="Your events" contextLabel="Event planning" dashboardHref="/admin/events" description="Your gatherings, from first idea to last goodbye. One place for the plans, the people, and what’s next.">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#202523]/10 px-4 py-3">
      <p className="min-w-0 break-words text-sm text-[#202523]/65">{principal.email ? <>Signed in as <span className="font-semibold text-[#202523]">{principal.email}</span></> : "Site administrator · existing events"}</p>
      {principal.ownerId ? <HostAccountButton signOut /> : <form action={logoutAdmin}><button className="inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4">Sign out</button></form>}
    </div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <nav aria-label="Event lists" className="flex flex-wrap gap-2">
        <Link href="/admin/events" aria-current={!archivedView ? "page" : undefined} className={`inline-flex min-h-12 items-center rounded-full border border-[#355f9e]/25 px-5 text-sm font-semibold ${!archivedView ? "bg-[#e9f2f8] text-[#214e91]" : "text-[#202523]/65"}`}>Active events</Link>
        <Link href="/admin/events?view=archived" aria-current={archivedView ? "page" : undefined} className={`inline-flex min-h-12 items-center rounded-full border border-[#355f9e]/25 px-5 text-sm font-semibold ${archivedView ? "bg-[#e9f2f8] text-[#214e91]" : "text-[#202523]/65"}`}>Archived{archivedCount !== undefined && ` (${archivedCount})`}</Link>
      </nav>
      <Link href="/admin/events/new" className="primary-button inline-flex min-h-12 items-center px-5 text-sm">+ Create event</Link>
    </div>
    <p className="mb-6 text-sm leading-6 text-[#202523]/65">{archivedView ? "Past plans and people, safely saved. Restore an event privately when you need it again." : "Each event appears once. Edit its private draft, manage its guests, or share what’s live."}</p>
    {showLegacy && !archivedView && !legacy && <aside role="status" className="mb-5 rounded-2xl border border-[#b78228]/25 bg-[#fff4d8] p-5 text-sm leading-6">Oyster Roast details couldn’t load. Your event has not changed. <Link href="/admin" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Manage Oyster Roast →</Link></aside>}
    {events ? <HostEventList events={events} archived={archivedView} /> : <>
      {!archivedView && legacy && <HostEventList events={[legacy]} />}
      <div role="alert" className="mt-5 rounded-2xl border border-[#b78228]/25 bg-[#fff4d8] p-5 text-sm leading-6">
        Your event list couldn’t load. No event status has been changed.
        <a className="ml-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={archivedView ? "/admin/events?view=archived" : "/admin/events"}>Refresh to try again →</a>
      </div>
    </>}
  </ContentShell>;
}
