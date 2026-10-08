import { rsvpDeadlineLabel } from "../../lib/rsvp-policy";

export function RsvpDeadlineNote({ deadline, timeZone }: { deadline?: string | null; timeZone: string }) {
  if (!deadline) return null;
  return <p className="mt-3 text-sm leading-6 text-[#202523]/65">Please reply by {rsvpDeadlineLabel(deadline, timeZone)}. Guest changes close at the same time.</p>;
}
