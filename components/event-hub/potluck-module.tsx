"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createRsvpEditToken } from "../../lib/rsvp-edit-token";
import { eventPaths } from "../../lib/event-routes";
import { POTLUCK_LIMITS, type PotluckClaim, type PublicPotluckItem } from "../../lib/potluck";
import { saveGuestPotluckClaim } from "../../app/event/potluck-actions";

export function PotluckModule({ items, eventSlug, unavailable = false }: { items: PublicPotluckItem[]; eventSlug: string; unavailable?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null), [guestName, setGuestName] = useState(""), [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(""), [success, setSuccess] = useState<{ claim: PotluckClaim; token: string } | null>(null), [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition(), busy = useRef(false), token = useRef<string | null>(null), router = useRouter();
  const item = items.find(i => i.key === selected);
  const editPath = success ? `${eventPaths(eventSlug).invitation}/bring/${success.token}` : "";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || !item || unavailable) return;
    busy.current = true; setError("");
    startTransition(async () => { try {
      token.current ??= createRsvpEditToken();
      const result = await saveGuestPotluckClaim("create", { itemKey: item.key, guestName, quantity, revision: 0, editToken: token.current }, eventSlug);
      if (!result.ok) { setError(result.message); router.refresh(); return; }
      setSuccess({ claim: result.data, token: token.current }); setCopied(false); setSelected(null); token.current = null; router.refresh();
    } catch { setError("Your signup couldn’t be confirmed. Please try again; your details are still here."); }
    finally { busy.current = false; } });
  }
  return <section aria-labelledby="potluck-heading" className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 sm:p-7">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#355f9e]">A little help from our friends</p>
    <h2 id="potluck-heading" className="mt-2 font-serif text-3xl sm:text-4xl">Bring something</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">Pick a little something to bring. We’ll keep track of what’s covered.</p>
    {success && <div role="status" className="mt-5 rounded-2xl border border-[#355f9e]/20 bg-[#e9f2f8] p-4 text-sm leading-6">
      <p className="font-semibold">You’re bringing the good stuff!</p><p>{success.claim.quantity} × {success.claim.title} is on your list.</p>
      <p className="mt-2 text-xs">Save your private link to change or cancel this signup. Anyone with it can manage this item for you. We won’t email it.</p>
      <div className="mt-2 flex flex-wrap gap-x-4"><Link href={editPath} className="inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline">Manage my signup</Link><button type="button" className="min-h-11 text-[#355f9e] underline" onClick={async () => { try { await navigator.clipboard.writeText(new URL(editPath, window.location.origin).href); setCopied(true); } catch { setCopied(false); setError("Copy wasn’t available. Open Manage my signup and save that page’s address."); } }}>{copied ? "Link copied" : "Copy private link"}</button></div>
    </div>}
    {unavailable ? <p role="status" className="py-8 text-sm leading-6 text-[#202523]/65">The bring-something list is taking a break. Please check back soon.</p> : !items.length ? <p className="py-8 font-serif text-xl">Nothing needed just yet. The host will add a few ideas here.</p> : <ul className="mt-5 divide-y divide-[#202523]/10">{items.map(i => {
      const remaining = Math.max(0, i.needed - i.claimed);
      return <li key={i.key} className="min-w-0 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-serif text-xl">{i.title}</h3>{i.note && <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#202523]/65">{i.note}</p>}<p className="mt-2 text-xs font-semibold text-[#355f9e]">{remaining ? `${remaining} still needed · ${i.claimed} of ${i.needed} covered` : "All covered — thank you!"}</p></div>
        <button type="button" disabled={pending || !remaining} aria-expanded={selected === i.key} aria-controls={`bring-form-${i.key}`} className="min-h-11 rounded-full border border-[#355f9e]/25 bg-[#e9f2f8] px-4 text-sm font-semibold text-[#214e91] disabled:opacity-50" onClick={() => { if (busy.current) return; setSelected(selected === i.key ? null : i.key); setQuantity(1); token.current = null; setError(""); }}>{selected === i.key ? "Close" : remaining ? "I’ll bring this" : "Covered"}</button></div>
        <div id={`bring-form-${i.key}`} hidden={selected !== i.key}>{selected === i.key && <form onSubmit={submit} className="mt-4 rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-4">
          <fieldset disabled={pending} className="space-y-4"><legend className="sr-only">Sign up to bring {i.title}</legend>
            <label className="field-label">Your name<input autoComplete="name" className="field-input" required maxLength={POTLUCK_LIMITS.guestName} value={guestName} onChange={e => setGuestName(e.target.value)} /></label>
            <label className="field-label">Quantity<input className="field-input" type="number" inputMode="numeric" required min={1} max={Math.min(POTLUCK_LIMITS.quantity, Math.max(1, remaining))} step={1} value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} /></label>
            <p className="text-xs leading-5 text-[#202523]/65">Your name is shared only with the host. This doesn’t change your RSVP.</p>
            <button type="submit" className="primary-button w-full" disabled={pending}>{pending ? "Saving your spot…" : "Count me in"}</button>
          </fieldset>
        </form>}</div>
      </li>;
    })}</ul>}
    {error && <p role="alert" className="mt-4 text-sm leading-6 text-[#843528]">{error}</p>}
  </section>;
}
