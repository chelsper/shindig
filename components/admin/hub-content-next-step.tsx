"use client";
import Link from "next/link";
import { useHostEvent } from "./host-event-context";

export function HubContentNextStep() {
  const { contentSetup, contentLive } = useHostEvent();
  if (!contentSetup || contentLive) return null;
  return <aside aria-label="Next step for this section" className="mt-4 rounded-xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 p-4 text-sm leading-6">
    <p>{contentSetup.enabled ? "Saved content stays private until you review & publish this event with the section enabled." : "Saved content is not on the live Hub: this section is off. Enable it above, then review & publish."}</p>
    <Link className="inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline underline-offset-4" href={contentSetup.enabled ? `/admin/events/${contentSetup.id}/publish` : "#hub-section-visibility"}>{contentSetup.enabled ? "Review & publish" : "Enable this section"} →</Link>
  </aside>;
}
