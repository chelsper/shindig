import Link from "next/link";
import { eventGuestsPath } from "../../lib/admin-guests";
import type { AdminRsvp, RsvpFilter, RsvpSummary } from "../../lib/server/rsvps";

const filters = [{ key: "all", label: "All" }, { key: "attending", label: "Attending" }, { key: "declined", label: "Can’t Make It" }] as const;
const notices = { create: "Guest added.", update: "RSVP updated.", delete: "RSVP deleted." };

export function EventGuestList({ id, timeZone, responses, summary, filter, q, saved }: {
  id: string; timeZone: string; responses: AdminRsvp[]; summary: RsvpSummary;
  filter: RsvpFilter; q: string; saved?: string;
}) {
  const base = eventGuestsPath(id);
  const format = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });
  const notice = saved && Object.hasOwn(notices, saved) ? notices[saved as keyof typeof notices] : null;
  return <section aria-label="Guest responses" className="min-w-0">
    {notice && <p role="status" className="mb-5 rounded-xl bg-[#e4eee1] p-4 text-sm text-[#285630]">{notice} Attendance totals and the Event Hub are up to date.</p>}
    <div className="mb-5 grid grid-cols-2 gap-3">
      <p className="rounded-2xl bg-[#e9f2f8] p-4"><strong className="block font-serif text-3xl">{summary.totalPartySize}</strong>guests attending</p>
      <p className="rounded-2xl bg-[#e9f2f8] p-4"><strong className="block font-serif text-3xl">{summary.totalResponses}</strong>responses · {summary.declined} declined</p>
    </div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href={`${base}/new`} className="primary-button inline-flex px-5">+ Add Guest</Link>
      <a className="inline-flex min-h-11 items-center text-sm text-[#355f9e] underline" href={`${base}/export`}>Export all RSVPs</a>
    </div>
    <form action={base} className="mb-4 flex flex-wrap items-end gap-3" role="search">
      <input type="hidden" name="filter" value={filter} />
      <label className="field-label min-w-0 flex-1 basis-48">Search guest names<input className="field-input" type="search" name="q" defaultValue={q} maxLength={120} placeholder="Guest or household name" /></label>
      <button type="submit" className="min-h-12 rounded-full border border-[#355f9e]/30 px-5 text-sm font-semibold text-[#355f9e]">Search</button>
    </form>
    <nav aria-label="Filter guest responses" className="mb-4 flex flex-wrap gap-2">
      {filters.map(({ key, label }) => <Link key={key} href={`${base}?${new URLSearchParams({ filter: key, ...(q ? { q } : {}) })}`} aria-current={filter === key ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border border-[#355f9e]/25 px-4 text-sm ${filter === key ? "bg-[#e9f2f8] text-[#214e91]" : "text-[#202523]/70"}`}>{label}</Link>)}
    </nav>
    <p className="mb-5 text-xs leading-5 text-[#202523]/60">Showing {responses.length} of {summary.totalResponses} responses · Newest first. Totals above include all guests.</p>
    {responses.length ? <ul className="space-y-3" aria-label="RSVP records">{responses.map((rsvp) => <li className="min-w-0 rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5" key={rsvp.id}>
      <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-serif text-2xl">{rsvp.guestName}</h2><Link href={`${base}/${rsvp.id}/edit`} aria-label={`Edit RSVP for ${rsvp.guestName}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[#355f9e]/25 px-4 text-sm text-[#355f9e]">Edit</Link></div>
      <p className="mt-2 text-sm">{rsvp.attending ? `Attending · Party of ${rsvp.partySize}` : "Can’t make it"} · {rsvp.attending && rsvp.displayOnGuestList ? "Name visibility on" : "Name hidden"}</p>
      {rsvp.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{rsvp.comment}</p>}
      <dl className="mt-4 grid gap-2 text-xs leading-5 text-[#202523]/60 sm:grid-cols-2"><div><dt>Submitted</dt><dd>{format.format(new Date(rsvp.createdAt))}</dd></div><div><dt>Last updated</dt><dd>{format.format(new Date(rsvp.updatedAt))}</dd></div></dl>
    </li>)}</ul> : <div className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-7 text-center"><p className="font-serif text-2xl">{summary.totalResponses ? "No guests match this search." : "No responses yet."}</p><p className="mt-2 text-sm leading-6 text-[#202523]/60">{summary.totalResponses ? "Try another name or change the attendance filter." : "Share your invitation, or add a guest who replied directly."}</p>{(q || filter !== "all") && <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-[#355f9e] underline" href={base}>Clear search and filters</Link>}</div>}
  </section>;
}
