import Link from "next/link";
import { eventStatus } from "../../lib/event-lifecycle";
import type { HostEventCard } from "../../lib/event-dashboard";
import { EventCardArtwork } from "./event-card-artwork";
import { LegacyEventShare } from "./legacy-event-share";

export function HostEventCardView({ event }: { event: HostEventCard }) {
  const published = event.status === "published", archived = event.status === "archived", draft = event.status === "draft";
  const label = eventStatus(draft ? null : { visibility: event.status as "published" | "unpublished" | "archived", rsvpsOpen: event.rsvpsOpen });
  const link = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/20 px-4 py-2 text-center text-sm font-semibold text-[#355f9e] transition hover:bg-[#e9f2f8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]";
  return <article aria-labelledby={`event-${event.id}-title`} className="min-w-0 rounded-[1.5rem] border border-[#202523]/12 bg-[#fffaf1]/95 p-5 shadow-[0_5px_25px_rgba(32,37,35,0.025)] sm:p-6">
    <div className="flex items-start gap-4 sm:gap-5">
      <EventCardArtwork key={event.image?.src ?? "empty"} image={event.image} />
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-bold uppercase tracking-[0.1em] ${published ? "text-[#285630]" : archived ? "text-[#202523]/60" : "text-[#355f9e]"}`}>{label}</p>
        <h2 id={`event-${event.id}-title`} className="mt-2 break-words font-serif text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl"><Link className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]" href={event.setupHref}>{event.title}</Link></h2>
        <p className="mt-2 text-xs leading-5 text-[#202523]/70 [overflow-wrap:anywhere]">{event.dateLabel}</p>
        {event.cityLabel && <p className="text-xs leading-5 text-[#202523]/60 [overflow-wrap:anywhere]">{event.cityLabel}</p>}
      </div>
    </div>
    <div className="mt-4 text-sm leading-6 text-[#202523]/70">
      <p>{event.legacy ? "Your original Oyster Roast. Its invitation, Hub and responses stay where they are." : draft ? "Private draft · Only you can see it. Keep shaping the plans." : archived ? "Last published version · Private · All saved data retained." : published ? "Live version · Saved edits stay private until you publish." : "Last published version · Guest links are unavailable. Your working draft and responses are saved."}</p>
      {event.draftTitle && <p className="mt-1 break-words [overflow-wrap:anywhere]">Saved draft name: <span className="font-semibold">{event.draftTitle}</span></p>}
      {event.hasUnpublishedChanges && <Link href={event.reviewHref + "#publication-changes"} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[#b78228]/20 bg-[#fff4d8] px-3 py-2 text-sm font-semibold text-[#765319] underline underline-offset-4">{archived ? "Saved changes to review" : "Changes waiting to publish"} →</Link>}
    </div>
    <nav aria-label={`Actions for ${event.title}`} className="mt-5 grid grid-cols-2 gap-2 border-t border-[#202523]/10 pt-4 sm:flex sm:flex-wrap">
      <Link className={`${link} border-[#355f9e]/25 bg-[#e9f2f8]/70`} href={archived ? event.reviewHref : event.editHref}>{archived ? "View & restore" : "Edit event"}</Link>
      {event.guestsHref && <Link className={link} href={event.guestsHref}>Manage guests</Link>}
      {published && event.publicHref && <a className={link} href={event.publicHref} target="_blank" rel="noreferrer">View live ↗</a>}
      {published && event.shareHref && <Link className={link} href={event.shareHref}>Share</Link>}
      {!published && !archived && <Link className={link} href={event.reviewHref}>{draft ? "Review & publish" : "Review & republish"}</Link>}
      <Link className={link} href={event.setupHref}>{event.legacy ? "Manage Oyster Roast" : "Event overview"}</Link>
      <Link className="inline-flex min-h-11 items-center justify-center px-2 text-xs font-semibold text-[#202523]/65 underline underline-offset-4 sm:ml-auto" href={event.duplicateHref}>Duplicate event</Link>
      {event.legacy && published && event.publicHref && <LegacyEventShare url={event.publicHref} />}
    </nav>
  </article>;
}

export function HostEventList({ events, archived = false }: { events: HostEventCard[]; archived?: boolean }) {
  if (!events.length) return <div className="rounded-3xl border border-dashed border-[#202523]/20 bg-[#fffaf1]/50 px-5 py-10 text-center">
    <h2 className="font-serif text-2xl">{archived ? "No archived events yet" : "Room for your next good gathering"}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">{archived ? "When the party is over, archive it from Publish & share. Its plans and people stay safely saved." : "Create a private draft whenever inspiration strikes. Nothing goes live until you review and publish."}</p>
  </div>;
  return <ul aria-label={archived ? "Archived events" : "Your active events"} className="space-y-5">{events.map((event) => <li key={event.id}><HostEventCardView event={event} /></li>)}</ul>;
}
