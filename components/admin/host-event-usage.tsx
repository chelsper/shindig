import Link from "next/link";
import type { HostEventUsage } from "../../lib/host-event-limits";
import { ContentShell } from "./content-shell";

export function HostEventUsageNotice({ usage, legacy = false }: { usage: HostEventUsage | null; legacy?: boolean }) {
  const full = usage && usage.used >= usage.limit;
  return <aside aria-label="Event storage" className={`mb-6 rounded-2xl border p-4 text-sm leading-6 sm:p-5 ${full || !usage ? "border-[#b78228]/25 bg-[#fff4d8]" : "border-[#355f9e]/15 bg-[#e9f2f8]/45"}`}>
    <p className="font-semibold">{usage ? `${usage.used} of ${usage.limit} event spaces used${full ? " · Limit reached" : ""}` : "Event availability couldn’t be checked"}</p>
    <p className="mt-1 text-[#202523]/70">{usage
      ? "Drafts, copies, live and archived events each use one space. Publishing or archiving doesn’t change your total."
      : "New events and copies are temporarily unavailable. Refresh to try again; your saved events can still be managed."}</p>
    {full && <p className="mt-2 text-[#202523]/75">Your events, guest responses and exports are still available. To free a space, export anything you need, then permanently delete an event from its Privacy &amp; data page. Only delete an event you no longer need.</p>}
    {legacy && usage && <p className="mt-2 text-xs text-[#202523]/60">These spaces cover events created in this administrator workspace. The original Oyster Roast is separate and unchanged.</p>}
  </aside>;
}

export function EventCreationUnavailable({ usage }: { usage: HostEventUsage | null }) {
  return <ContentShell title={usage ? "Your saved events are still here" : "Let’s try again shortly"} contextLabel="Your events" dashboardHref="/admin/events" description={usage ? "You’ve used your event spaces. You can keep editing and managing every existing gathering." : "We couldn’t check availability for a new event. No new event has been created."}>
    <HostEventUsageNotice usage={usage} />
    <div className="flex flex-wrap gap-4">
      <Link href="/admin/events" className="primary-button inline-flex min-h-12 items-center px-5 text-sm">Back to your events</Link>
      <a href="" className="inline-flex min-h-12 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4">Check again</a>
    </div>
  </ContentShell>;
}
