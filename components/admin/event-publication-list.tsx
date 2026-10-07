import Link from "next/link";
import { eventStatus, type EventLifecycle } from "../../lib/event-lifecycle";

type EventSummary = EventLifecycle & { id: string; title: string; hasUnpublishedChanges: boolean };

export function EventPublicationList({ events, archived = false }: { events: EventSummary[]; archived?: boolean }) {
  if (!archived && !events.length) return null;
  return <section className="mt-6 space-y-3" aria-label={archived ? "Archived events" : "Published and unpublished events"}>
    {archived && <div className="mb-5"><h2 className="font-serif text-3xl">Gatherings worth keeping</h2><p className="mt-2 text-sm leading-6 text-[#202523]/65">Your past plans and people, safely saved. Restore an event privately when you need it again.</p></div>}
    {archived && !events.length && <p className="rounded-2xl border border-dashed border-[#202523]/20 px-5 py-10 text-center text-sm leading-6 text-[#202523]/65">No archived events yet. When a gathering is finished, archive it from Manage &amp; share. Nothing gets deleted.</p>}
    {events.map((event) => <Link className={`block rounded-2xl border border-[#285630]/20 p-5 ${archived ? "bg-[#fffaf1]" : event.visibility === "published" ? "bg-[#eff5e8]" : "bg-[#fff4d8]"}`} href={`/admin/events/${event.id}/setup`} key={event.id}>
      <p className="text-xs font-bold uppercase text-[#285630]">{eventStatus(event)} · {archived ? "View & restore" : "Manage & share"}</p>
      <h2 className="mt-1 break-words font-serif text-2xl">{event.title}</h2>
      {archived && <p className="mt-2 text-sm text-[#202523]/65">Private · RSVPs closed · All saved data retained</p>}
      {event.hasUnpublishedChanges && <p className="mt-2 text-sm text-[#202523]/65">Unpublished changes</p>}
    </Link>)}
  </section>;
}
