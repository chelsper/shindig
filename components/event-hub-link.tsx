import Link from "next/link";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

// Public navigation must not depend on RSVP status or a saved browser session.
export function EventHubLink({ label = "Event Hub" }: { label?: string }) {
  return (
    <Link
      href={OYSTER_ROAST_EVENT.eventHub.path}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/70 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#214e91] transition hover:border-[#355f9e]/55 hover:bg-[#e9f2f8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e] sm:text-xs"
    >
      {label}<span aria-hidden="true">→</span>
    </Link>
  );
}
