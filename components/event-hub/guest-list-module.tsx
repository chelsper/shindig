"use client";
import { useState } from "react";
import type { PublicGuestList } from "../../lib/server/rsvps";
import { guestListPreview } from "../../lib/guest-list-preview";

export function GuestListModule({ guestList, unavailable = false }: { guestList: PublicGuestList | null; unavailable?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const total = guestList?.totalGuestCount ?? 0;
  const guests = guestList?.guests ?? [];
  const preview = guestListPreview(guests.map((guest) => guest.guestName));
  return <section aria-labelledby="guest-list-heading" className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
    <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">Guest list</p>
    <h2 id="guest-list-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">Who’s Coming</h2>
    {unavailable ? <p className="mt-4 text-sm leading-6 text-[#202523]/60">The guest list is taking a quick break. Please check back soon.</p> : <>
      <p className="mt-3 font-serif text-2xl text-[#355f9e]">{total} {total === 1 ? "guest is" : "guests are"} coming</p>
      {guests.length ? <>
        {!expanded ? <p className="mt-2 break-words text-sm leading-6 text-[#202523]/75">{new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(preview.names)}{preview.more ? " + more" : ""}</p> : null}
        <div id="public-guest-list" hidden={!expanded}>
          {expanded ? <ul aria-label="Public guest names" className="mt-4 divide-y divide-[#202523]/8">
            {guests.map((guest, index) => <li key={`${guest.guestName}-${index}`} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 break-words font-serif text-xl">{guest.guestName}</span>
              {guest.partySize > 1 ? <span className="shrink-0 rounded-full bg-[#e9f2f8]/70 px-3 py-1 text-xs text-[#214e91]">Party of {guest.partySize}</span> : null}
            </li>)}
          </ul> : null}
        </div>
        <button className="mt-2 min-h-11 text-sm font-semibold text-[#355f9e] underline decoration-[#355f9e]/25 underline-offset-4" type="button" aria-expanded={expanded} aria-controls="public-guest-list" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less ↑" : "See everyone →"}</button>
      </> : <p className="mt-3 text-sm leading-6 text-[#202523]/60">{total > 0 ? "Guests are coming! No one has chosen to appear publicly just yet." : "The guest list is ready for its first name. RSVP from the invitation when you know you can join us."}</p>}
      <p className="mt-2 text-xs leading-5 text-[#202523]/50">Only names shared publicly appear here. The total also includes private guests.</p>
    </>}
  </section>;
}
