import type { PublicHostUpdate } from "../../lib/updates";

// Only accept the already-public update projection. No admin records or guest
// details are loaded for this summary, and disabled/unavailable feeds stay hidden.
export function LatestHostNote({ updates, timeZone }: { updates: PublicHostUpdate[]; timeZone: string }) {
  const latest = updates.reduce<PublicHostUpdate | null>((newest, update) =>
    Number.isFinite(Date.parse(update.publishedAt)) && (!newest || Date.parse(update.publishedAt) > Date.parse(newest.publishedAt)) ? update : newest, null);
  if (!latest) return null;
  return <aside aria-label="Latest host note" className="mt-5 rounded-2xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 px-5 py-4 text-[#202523]">
    <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[#355f9e]">Before you head over</p>
    <h2 className="mt-1 font-serif text-2xl break-words">{latest.heading || "A note from your host"}</h2>
    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 break-words text-[#202523]/80">{latest.message}</p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-[#355f9e]">
      <time dateTime={latest.publishedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(latest.publishedAt))}</time>
      <a href="#updates" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Read host updates <span aria-hidden="true" className="ml-2">→</span></a>
    </div>
  </aside>;
}
