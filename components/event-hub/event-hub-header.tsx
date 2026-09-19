import Link from "next/link";

import type { EventHubHeaderSettings } from "../../lib/event-hub-settings";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { EventHeaderImage } from "./event-header-image";

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}

function DirectionsIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 8.25 8.25a1.06 1.06 0 0 1 0 1.5L12 21l-8.25-8.25a1.06 1.06 0 0 1 0-1.5L12 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 13.5V11a2 2 0 0 1 2-2h5m-2-2 2 2-2 2" />
    </svg>
  );
}

export function EventHubHeader({
  headerSettings,
}: {
  headerSettings: EventHubHeaderSettings;
}) {
  const event = OYSTER_ROAST_EVENT;
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`;

  return (
    <header className="overflow-hidden rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 shadow-[0_18px_50px_rgba(41,56,53,0.10)] sm:rounded-[2rem]">
      <EventHeaderImage settings={headerSettings} />

      <div className="p-5 sm:p-7 lg:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#355f9e]">
                Event Hub
              </p>
              <h1 className="mt-2 max-w-2xl font-serif text-4xl leading-[0.98] tracking-[-0.04em] sm:text-5xl">
                {event.title}
              </h1>
            </div>
            <Link
              className="hidden text-xs font-bold uppercase tracking-[0.12em] text-[#202523]/50 underline decoration-[#202523]/20 underline-offset-4 transition hover:text-[#355f9e] sm:inline-flex"
              href="/"
            >
              Invitation
            </Link>
          </div>

          <dl className="mt-6 grid gap-3 border-y border-[#202523]/12 py-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-[#202523]/45">When</dt>
              <dd className="mt-1 font-semibold">{event.dateLabel}</dd>
              <dd className="mt-0.5 text-[#202523]/62">{event.timeLabel}</dd>
            </div>
            <div>
              <dt className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-[#202523]/45">Where</dt>
              <dd className="mt-1 font-semibold">{event.venue}</dd>
              <dd className="mt-0.5 text-[#202523]/62">{event.address}</dd>
            </div>
          </dl>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <a
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#202523] bg-[#202523] px-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-[#fffaf1] transition hover:border-[#355f9e] hover:bg-[#355f9e]"
              download={event.calendarFilename}
              href="/calendar/oyster-roast.ics"
            >
              <CalendarIcon />
              Add to Calendar
            </a>
            <a
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/80 px-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-[#214e91] transition hover:border-[#355f9e] hover:bg-[#e9f2f8]"
              href={directionsUrl}
              rel="noreferrer"
              target="_blank"
            >
              <DirectionsIcon />
              Get Directions
            </a>
          </div>

          <Link
            className="mt-5 inline-flex text-xs font-bold uppercase tracking-[0.12em] text-[#202523]/50 underline decoration-[#202523]/20 underline-offset-4 sm:hidden"
            href="/"
          >
            Return to invitation
          </Link>
      </div>
    </header>
  );
}
