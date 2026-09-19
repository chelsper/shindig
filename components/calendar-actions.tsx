import {
  getGoogleCalendarUrl,
  getOutlookCalendarUrl,
  getRsvpUpdateUrl,
} from "../lib/calendar";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

type CalendarActionsProps = {
  editToken?: string | null;
};

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
  );
}

export function CalendarActions({ editToken }: CalendarActionsProps) {
  const rsvpUrl = editToken ? getRsvpUpdateUrl(editToken) : undefined;
  const googleCalendarUrl = getGoogleCalendarUrl(rsvpUrl);
  const outlookCalendarUrl = getOutlookCalendarUrl(rsvpUrl);
  const icsUrl = editToken
    ? `/calendar/oyster-roast.ics?token=${encodeURIComponent(editToken)}`
    : "/calendar/oyster-roast.ics";
  const linkClassName =
    "flex min-h-12 items-center justify-center rounded-xl border border-[#202523]/15 bg-white/55 px-2 text-xs font-bold text-[#202523]/72 transition hover:border-[#355f9e]/45 hover:text-[#214e91]";

  return (
    <div className="mt-6">
      <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#202523]/62">
        <CalendarIcon />
        Add to Calendar
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <a
          className={linkClassName}
          href={googleCalendarUrl}
          rel="noreferrer"
          target="_blank"
        >
          Google
        </a>
        <a
          className={linkClassName}
          download={OYSTER_ROAST_EVENT.calendarFilename}
          href={icsUrl}
        >
          Apple
        </a>
        <a
          className={linkClassName}
          href={outlookCalendarUrl}
          rel="noreferrer"
          target="_blank"
        >
          Outlook
        </a>
      </div>
    </div>
  );
}
