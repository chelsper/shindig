import Link from "next/link";
import type { PublicationIssue } from "../../lib/event-readiness";

export type PublishBlocker = { id: string; message: string; href: string };
export function publicationBlocker(id: string, issue: PublicationIssue): PublishBlocker {
  return { id: issue.id, message: issue.message, href: `/admin/events/${id}${issue.destination}` };
}

export function PublishReadiness({ id, blockers }: { id: string; blockers: PublishBlocker[] }) {
  if (!blockers.length) return null;
  return <section id="publish-readiness" aria-labelledby="publish-readiness-heading" className="scroll-mt-6 rounded-3xl border border-[#b78228]/30 bg-[#fff4d8] p-5 sm:p-7">
    <h2 id="publish-readiness-heading" className="font-serif text-2xl">{blockers.length === 1 ? "One thing" : `${blockers.length} things`} before you can publish</h2>
    <p className="mt-2 text-sm leading-6">Your saved draft stays private. Publishing stays locked until these details are ready.</p>
    <ul className="mt-3 space-y-2">{blockers.map((blocker) => <li key={blocker.id}>
      <Link className="inline-flex min-h-12 items-center gap-3 text-sm font-semibold text-[#765319] underline underline-offset-4" href={blocker.href}>{blocker.message}<span aria-hidden="true">→</span></Link>
      {blocker.id === "weather" && <p className="text-xs leading-5">Not using Weather? <Link className="inline-flex min-h-11 items-center font-semibold text-[#765319] underline" href={`/admin/events/${id}/settings#hub-settings-heading`}>Turn it off in RSVP &amp; Hub, then save</Link>.</p>}
    </li>)}</ul>
    <p className="mt-3 text-xs leading-5">After saving any changes, come back to Review &amp; publish and confirm the updated version.</p>
  </section>;
}
