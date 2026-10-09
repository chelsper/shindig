"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { saveGuestPotluckClaim } from "../../app/event/potluck-actions";
import { POTLUCK_LIMITS, type PotluckClaim } from "../../lib/potluck";
import type { EventConfiguration } from "../../lib/oyster-roast-event";
import { EventDesignSurface, EventGuestContent } from "../event-design/event-presentation";

export function PotluckClaimEditor({ event, initial, token }: { event: EventConfiguration; initial: PotluckClaim; token: string }) {
  const [claim, setClaim] = useState(initial), [name, setName] = useState(initial.guestName), [quantity, setQuantity] = useState(initial.quantity || 1);
  const [confirmCancel, setConfirmCancel] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition(), busy = useRef(false);
  function save(cancel: boolean) {
    if (busy.current || (cancel && !confirmCancel)) return;
    busy.current = true; setError(""); setMessage("");
    startTransition(async () => { try {
      const result = await saveGuestPotluckClaim(cancel ? "cancel" : "update", { itemKey: claim.itemKey, editToken: token, guestName: name, quantity, revision: claim.revision }, event.slug);
      if (!result.ok) { setError(result.message); return; }
      setClaim(result.data); setConfirmCancel(false); setMessage(cancel ? "All set — your spot is available for someone else. Thanks for letting us know!" : "Your signup is updated. Thanks for bringing a little something!");
    } catch { setError("We couldn’t confirm that change. Please try again."); }
    finally { busy.current = false; } });
  }
  const content = <main className="mx-auto min-h-screen max-w-xl px-5 py-10">
    <Link className="inline-flex min-h-11 items-center text-sm underline" href={event.eventHub.path}>← Back to Event Hub</Link>
    <p className="mt-5 text-xs uppercase tracking-widest">{event.title}</p><h1 className="mt-2 font-serif text-4xl">Your little contribution</h1>
    <h2 className="mt-5 break-words font-serif text-2xl">{claim.title}</h2>
    <p className="mt-2 text-sm leading-6">{claim.quantity ? `You’re signed up for ${claim.quantity}.` : "This signup has been canceled."} Your name stays between you and the host. This does not change your RSVP.</p>
    {claim.archived && <p className="mt-4 text-sm leading-6">The host has closed this item. You can still cancel your signup below.</p>}
    {!claim.archived && <form className="mt-6" onSubmit={e => { e.preventDefault(); save(false); }}><fieldset disabled={pending} className="space-y-4">
      <label className="field-label">Your name<input className="field-input" autoComplete="name" required maxLength={POTLUCK_LIMITS.guestName} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="field-label">Quantity<input className="field-input" type="number" inputMode="numeric" min={1} max={20} step={1} required value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} /></label>
      <button type="submit" className="primary-button w-full" disabled={pending}>{pending ? "Saving…" : claim.quantity ? "Save signup changes" : "Sign up again"}</button>
    </fieldset></form>}
    {claim.quantity > 0 && <div className="mt-6 border-t border-current/15 pt-4"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmCancel} disabled={pending} onChange={e => setConfirmCancel(e.target.checked)} />I need to cancel this signup</label><button type="button" disabled={!confirmCancel || pending} onClick={() => save(true)} className="min-h-11 text-sm underline disabled:opacity-40">Cancel my signup</button></div>}
    {error && <p role="alert" className="mt-5 text-sm leading-6">{error} <button type="button" disabled={pending} className="min-h-11 underline" onClick={() => window.location.reload()}>Reload saved signup</button></p>}
    {message && <p role="status" className="mt-5 rounded-xl border border-current/20 p-4 text-sm leading-6">{message}</p>}
    <p className="mt-6 text-xs leading-5">Keep this private link. Anyone who has it can change or cancel this signup. We don’t send email or text confirmations.</p>
  </main>;
  return event.design ? <EventDesignSurface appearance={event.design} fullHeight><EventGuestContent>{content}</EventGuestContent></EventDesignSurface> : content;
}
