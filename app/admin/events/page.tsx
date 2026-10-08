import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listEventDrafts } from "../../../lib/server/event-drafts";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { listHostPublications } from "../../../lib/server/event-publications";
import { EventPublicationList } from "../../../components/admin/event-publication-list";
import { duplicateEventPath } from "../../../lib/event-duplication";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Events | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AdminEventsPage({ searchParams }: { searchParams?: Promise<{ view?: string | string[] }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const archivedView = (await searchParams)?.view === "archived";
  let drafts;
  try { drafts = await listEventDrafts(); }
  catch { console.error("Private event drafts could not be loaded."); }
  let publications: Awaited<ReturnType<typeof listHostPublications>> = [];
  let publicationListUnavailable = false;
  try { publications = await listHostPublications(); } catch { publicationListUnavailable = true; console.error("Event publication list unavailable."); }
  const archivedEvents = publications.filter((event) => event.visibility === "archived");
  const archivedIds = new Set(archivedEvents.map((event) => event.id));
  const activeEvents = publications.filter((event) => event.visibility !== "archived");
  const activeDrafts = drafts?.filter((draft) => !archivedIds.has(draft.id));
  return <ContentShell title="Your events" contextLabel="Event planning" description="One gathering already on the calendar. Room for your next good idea.">
    <nav aria-label="Event lists" className="mb-6 flex flex-wrap gap-3">
      <Link href="/admin/events" aria-current={!archivedView ? "page" : undefined} className={`inline-flex min-h-12 items-center rounded-full border border-[#355f9e]/25 px-5 text-sm font-semibold ${!archivedView ? "bg-[#e9f2f8] text-[#214e91]" : "text-[#202523]/65"}`}>Active events</Link>
      <Link href="/admin/events?view=archived" aria-current={archivedView ? "page" : undefined} className={`inline-flex min-h-12 items-center rounded-full border border-[#355f9e]/25 px-5 text-sm font-semibold ${archivedView ? "bg-[#e9f2f8] text-[#214e91]" : "text-[#202523]/65"}`}>Archived{!publicationListUnavailable && ` (${archivedEvents.length})`}</Link>
    </nav>
    {!archivedView && <section aria-label="Existing live event" className="rounded-[1.5rem] border border-[#355f9e]/20 bg-[#fffaf1]/90 p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#285630]">Live event</p>
      <h2 className="mt-2 font-serif text-2xl">{OYSTER_ROAST_EVENT.hostTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-[#202523]/65">Your existing invitation, Event Hub, and guest responses stay exactly where they are.</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4" href="/admin">Manage Oyster Roast →</Link>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4" href={duplicateEventPath(OYSTER_ROAST_EVENT.slug)}>Duplicate Event →</Link>
        <a className="inline-flex min-h-11 items-center text-sm text-[#355f9e] underline underline-offset-4" href={OYSTER_ROAST_EVENT.websiteUrl} target="_blank" rel="noreferrer">View invitation ↗</a>
      </div>
    </section>}
    {publicationListUnavailable && <p role="alert" className="mt-6 rounded-2xl bg-[#fff4d8] p-5 text-sm leading-6">Event statuses couldn’t load. Refresh to try again; check migrations through 016 are installed if this is a new deployment. No event status has been changed.</p>}
    {!publicationListUnavailable && <EventPublicationList events={archivedView ? archivedEvents : activeEvents} archived={archivedView} />}
    {!archivedView && !publicationListUnavailable && <section className="mt-8 pb-8" aria-labelledby="draft-list-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 id="draft-list-heading" className="font-serif text-3xl">In the making</h2><p className="mt-1 text-sm text-[#202523]/60">Private working drafts. Saving changes here never updates a published version.</p></div>
        <Link href="/admin/events/new" className="primary-button inline-flex min-h-12 items-center px-5 text-sm">+ Create event</Link>
      </div>
      {!activeDrafts ? <p role="alert" className="mt-5 rounded-2xl bg-[#fff4d8] p-5 text-sm leading-6 text-[#765319]">Drafts couldn’t load. If this is the first setup, apply migration 010 to your Neon database. Otherwise, refresh and try again. Your live event hasn’t changed.</p>
        : activeDrafts.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-[#202523]/20 px-5 py-10 text-center text-sm leading-6 text-[#202523]/65">The next good gathering starts here. Create a draft whenever inspiration strikes.</p>
          : <ul className="mt-5 space-y-3" aria-label="Private event drafts">{activeDrafts.map((draft) => <li key={draft.id}>
            <Link href={`/admin/events/${draft.id}/setup`} className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-[#202523]/10 bg-[#fffaf1]/90 p-5 transition hover:border-[#355f9e]/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]">
              <div className="min-w-0"><p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[#355f9e]">{publications.some((event) => event.id === draft.id) ? "Private working copy" : publicationListUnavailable ? "Private working copy · public status unavailable" : "Private draft"}</p><h3 className="mt-1 break-words font-serif text-2xl">{draft.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[#202523]/60">{draft.startsAtUtc ? `${new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.startsAtUtc))} · ${draft.timeZone.replaceAll("_", " ")}` : "Date to be decided"}{draft.cityLabel ? ` · ${draft.cityLabel}` : ""}</p>
              </div><span aria-hidden="true" className="shrink-0 text-[#355f9e]">→</span>
            </Link>
          </li>)}</ul>}
    </section>}
  </ContentShell>;
}
