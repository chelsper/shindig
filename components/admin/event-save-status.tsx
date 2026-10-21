import { eventSaveStatus, hubSaveNotice, type SaveStatusInput } from "../../lib/event-save-status";

export function EventSaveStatus(props: SaveStatusInput & { compact?: boolean }) {
  const status = eventSaveStatus(props);
  const colors = status.tone === "live" ? "border-[#285630]/20 bg-[#e4eee1] text-[#285630]" : status.tone === "warning" ? "border-[#b78228]/25 bg-[#fff4d8] text-[#765319]" : "border-[#355f9e]/20 bg-[#e9f2f8] text-[#214e91]";
  return <div role="status" aria-live="polite" aria-atomic="true" className={`min-w-0 rounded-xl border px-3 py-2 ${colors}`}>
    <p className="text-xs font-semibold leading-5">{status.label}</p>
    {!props.compact && <p className="mt-1 text-xs leading-5">{status.detail}</p>}
  </div>;
}

export function HubSaveNotice({ live, behavior = "immediate" }: { live: boolean; behavior?: "immediate" | "moderated" | "private" }) {
  return <p className="rounded-xl border border-[#355f9e]/20 bg-[#e9f2f8]/65 px-3 py-2 text-xs leading-5 text-[#214e91]">{hubSaveNotice(live, behavior)}</p>;
}
