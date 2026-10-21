import Link from "next/link";
import type { MouseEvent } from "react";

// Navigation only: invitation planning, actual RSVPs and consented contacts
// keep their existing, separately authorized data layers and actions.
export function EventGuestsNavigation({ id, current, publishedBefore, onNavigate }: {
  id: string;
  current: "invitations" | "rsvps" | "contacts" | "other";
  publishedBefore: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const base = `/admin/events/${id}`;
  return <section aria-label="Guest tools" className="mb-6">
    <nav aria-label="Guest management" className="flex flex-wrap gap-2">
      {[
        { key: "invitations", label: "Invitation Tracker", path: "/invitations", available: true },
        { key: "rsvps", label: "RSVP Responses", path: "/guests", available: publishedBefore },
        { key: "contacts", label: "Private Contacts", path: "/guests?view=contacts", available: publishedBefore },
      ].map(section => section.available ? <Link key={section.key} href={`${base}${section.path}`} onClick={onNavigate}
        aria-current={current === section.key ? "page" : undefined}
        className={`inline-flex min-h-11 items-center rounded-full border border-[#355f9e]/25 px-4 py-2 text-sm text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 ${current === section.key ? "bg-[#e9f2f8] font-semibold" : "hover:bg-[#e9f2f8]/60"}`}>
        {section.label}
      </Link> : <span key={section.key} className="inline-flex min-h-11 items-center px-3 text-sm text-[#202523]/55" aria-disabled="true">{section.label}</span>)}
    </nav>
    <p className="mt-2 text-xs leading-5 text-[#202523]/65">Plan who to invite, review actual replies, or use guest-approved update contacts. These lists stay separate.{!publishedBefore && " Responses and private contacts become available after first publication. You can plan invitations now."}</p>
  </section>;
}
