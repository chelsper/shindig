import { RSVP_CLOSED_MESSAGE } from "../../lib/event-lifecycle";
import { RSVP_DEADLINE_MESSAGE } from "../../lib/rsvp-policy";

export function RsvpsClosed({ deadlinePassed = false }: { deadlinePassed?: boolean }) {
  return <div className="py-4 text-center">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#355f9e]">A note from your host</p>
    <h2 className="mt-3 font-serif text-3xl">{deadlinePassed ? "The reply-by date has passed" : "RSVPs are closed"}</h2>
    <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#202523]/65">{deadlinePassed ? RSVP_DEADLINE_MESSAGE : RSVP_CLOSED_MESSAGE}</p>
    <p className="mt-3 text-sm leading-6 text-[#202523]/65">Already replied? Your response is still saved. You can keep visiting the Event Hub.</p>
  </div>;
}
