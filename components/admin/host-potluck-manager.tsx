"use client";
import { useRef, useState, useTransition } from "react";
import { useHostEvent } from "./host-event-context";
import { savePotluckItem, releasePotluckSignup } from "../../app/admin/potluck/actions";
import { POTLUCK_LIMITS, type HostPotluckItem, type PotluckItemInput, type PotluckResult } from "../../lib/potluck";
const blank = (): PotluckItemInput => ({ key: "", title: "", note: "", needed: 1, revision: 0, archived: false });
const button = "inline-flex min-h-11 items-center rounded-full border border-[#355f9e]/25 px-4 text-sm font-semibold text-[#355f9e] disabled:opacity-40";
export function HostPotluckManager({ initial }: { initial: HostPotluckItem[] }) {
  const { slug, contentLive } = useHostEvent(), [items, setItems] = useState(initial), [editing, setEditing] = useState<PotluckItemInput | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [releaseId, setReleaseId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition(), busy = useRef(false), createKey = useRef<string | null>(null);
  function run(action: () => Promise<PotluckResult<HostPotluckItem[]>>, success: string) {
    if (busy.current || !slug) return;
    busy.current = true; setError(""); setMessage("");
    startTransition(async () => { try { const result = await action(); if (!result.ok) { setError(result.message); return; } setItems(result.data); setEditing(null); setReleaseId(null); createKey.current = null; setMessage(success); }
    catch { setError("We couldn’t confirm the change. Your details are still here; please try again."); }
    finally { busy.current = false; } });
  }
  return <section aria-label="Manage bring-something signups">
    <p className="text-sm leading-6 text-[#202523]/65">Name each item and the quantity needed, like “Bags of ice” or “A side dish for 6.” Guest names stay host-only. {contentLive ? "Saved item changes appear immediately when this feature is enabled on the published Hub." : "Items stay private until you publish the event with Bring something enabled."}</p>
    <p className="mt-2 text-xs leading-5 text-[#202523]/60">Closing an item hides it and stops new signups; existing commitments stay here until canceled or released. No messages are sent.</p>
    <button type="button" className={`${button} mt-4`} disabled={pending || Boolean(editing) || items.length >= POTLUCK_LIMITS.items} onClick={() => { setEditing(blank()); createKey.current = null; setError(""); setMessage(""); }}>+ Add something to bring</button>
    {editing && <form className="mt-5 rounded-2xl border border-[#202523]/15 bg-[#fffaf1] p-5" onSubmit={e => { e.preventDefault(); if (!slug) return; createKey.current ??= crypto.randomUUID(); run(() => savePotluckItem({ ...editing, key: editing.key || createKey.current! }, slug), "Item saved."); }}>
      <fieldset disabled={pending} className="space-y-4"><legend className="mb-4 font-serif text-xl">{editing.revision ? "Edit item" : "A little something"}</legend>
        <label className="field-label">Item<input autoFocus className="field-input" required maxLength={100} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label>
        <label className="field-label">Helpful note (optional)<textarea className="field-input min-h-20 py-3" maxLength={500} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
        <label className="field-label">Total quantity needed<input className="field-input" type="number" inputMode="numeric" min={1} max={100} step={1} required value={editing.needed || ""} onChange={e => setEditing({ ...editing, needed: Number(e.target.value) })} /></label>
        <div className="flex flex-wrap gap-3"><button type="submit" className={button} disabled={pending}>{pending ? "Saving…" : "Save item"}</button><button type="button" className={button} disabled={pending} onClick={() => { setEditing(null); createKey.current = null; }}>Cancel editing</button></div>
      </fieldset>
    </form>}
    {error && <p role="alert" className="mt-4 text-sm leading-6 text-[#843528]">{error} Reload this page if another host tab changed the list.</p>}
    {message && <p role="status" className="mt-4 text-sm text-[#285630]">{message}</p>}
    {!items.length && <p className="py-8 font-serif text-xl">Start with a few things that would make hosting easier.</p>}
    <ul className="mt-5 space-y-4">{items.map(item => <li key={item.key} className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5">
      <h2 className="break-words font-serif text-2xl">{item.title}</h2><p className="mt-1 text-sm text-[#202523]/65">{item.claimed} of {item.needed} covered · {item.archived ? "Closed / hidden" : `${Math.max(0, item.needed - item.claimed)} still needed`}</p>
      {item.note && <p className="mt-2 whitespace-pre-line break-words text-sm">{item.note}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={pending || Boolean(editing)} onClick={() => { setEditing({ key: item.key, title: item.title, note: item.note, needed: item.needed, revision: item.revision, archived: item.archived }); setError(""); }}>Edit item</button>
        <button type="button" className={button} disabled={pending || Boolean(editing)} onClick={() => run(() => savePotluckItem({ ...item, archived: !item.archived }, slug!), item.archived ? "Item reopened." : "Item closed. Existing commitments are preserved.")}>{item.archived ? "Reopen item" : "Close item"}</button></div>
      {!!item.claims.length && <ul className="mt-4 divide-y divide-[#202523]/10 border-t border-[#202523]/10">{item.claims.map(claim => <li className="py-3 text-sm" key={claim.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words">{claim.guestName} · {claim.quantity}</span><button type="button" className="min-h-11 text-[#355f9e] underline disabled:opacity-40" disabled={pending || Boolean(editing)} onClick={() => setReleaseId(releaseId === claim.id ? null : claim.id)}>Release signup</button></div>{releaseId === claim.id && <div className="rounded-xl bg-[#fff4d8] p-3"><p>Release {claim.guestName}’s {claim.quantity}? Their spot will become available. No message is sent.</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" className={button} disabled={pending} onClick={() => run(() => releasePotluckSignup(claim.id, true, slug!), "Signup released. The guest’s private link now shows it as canceled.")}>Confirm release</button><button type="button" className={button} disabled={pending} onClick={() => setReleaseId(null)}>Keep signup</button></div></div>}</li>)}</ul>}
    </li>)}</ul>
  </section>;
}
