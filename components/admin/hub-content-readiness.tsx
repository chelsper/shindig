import Link from "next/link";
import type { EventFeatures } from "../../lib/oyster-roast-event";
import { hubContentReadiness, type HubContentPreview } from "../../lib/event-hub-preview";

export function HubContentReadiness({ id, content, features, compact = false }: { id: string; content: HubContentPreview; features: EventFeatures; compact?: boolean }) {
  const entries = hubContentReadiness(content, features);
  if (!entries.length) return null;
  const suggestions = entries.filter(e => e.status === "Add content when ready" || e.status === "Couldn’t check").length;
  return <details open={!compact} className="rounded-2xl border border-[#355f9e]/20 bg-[#fffaf1]/90 p-4 sm:p-5">
    <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-[#355f9e]">Hub content check · {suggestions ? `${suggestions} ${suggestions === 1 ? "suggestion" : "suggestions"}` : "Ready to preview"}</summary>
    <p className="mt-2 text-xs leading-5 text-[#202523]/65">Optional guidance, not publishing requirements. This checks your saved Hub choices. Sections marked live already use this content; other prepared content stays private until published with its feature enabled.</p>
    <ul className="mt-3 divide-y divide-[#202523]/10">{entries.map(entry => <li key={entry.id} className="py-3 text-sm leading-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-semibold">{entry.label}</span><span className="text-xs text-[#355f9e]">{entry.status}</span></div>
      <p className="text-[#202523]/65">{entry.message}</p>
      <div className="flex flex-wrap items-center gap-x-4"><span className="text-xs text-[#202523]/60">{entry.live === null ? "Live status unavailable" : entry.live ? "Already live" : "Private until publication"}</span><Link className="inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline underline-offset-4" href={`/admin/events/${id}/content?view=${entry.id}`}>{entry.action} →</Link></div>
    </li>)}</ul>
  </details>;
}
