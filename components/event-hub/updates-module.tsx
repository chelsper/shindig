import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import type { PublicHostUpdate } from "../../lib/updates";

export function UpdatesModule({ updates, unavailable = false }: { updates: PublicHostUpdate[]; unavailable?: boolean }) {
  return (
    <section aria-labelledby="updates-heading" className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
      <div className="border-b border-[#202523]/10 pb-5">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">A note from your hosts</p>
        <h2 id="updates-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">Host Updates</h2>
        <p className="mt-2 text-sm text-[#202523]/65">The latest little details for the roast.</p>
      </div>
      {unavailable ? (
        <p className="py-9 text-center text-sm leading-6 text-[#202523]/65">Updates are taking a quick break. Please check back soon.</p>
      ) : updates.length === 0 ? (
        <p className="px-2 py-10 text-center font-serif text-2xl leading-snug text-[#202523]/70">All quiet for now. We’ll share any updates here.</p>
      ) : (
        <ol aria-label="Host updates" className="divide-y divide-[#202523]/10">
          {updates.map((update, index) => (
            <li className="break-words py-5" key={`${update.publishedAt}-${index}`}>
              <time className="text-xs text-[#355f9e]" dateTime={update.publishedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: OYSTER_ROAST_EVENT.timeZone }).format(new Date(update.publishedAt))}</time>
              {update.heading ? <h3 className="mt-2 font-serif text-2xl leading-tight">{update.heading}</h3> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#202523]/80">{update.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
