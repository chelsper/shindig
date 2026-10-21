"use client";
import { useState, type FormEvent } from "react";
import type { InvitationChange, Invitee } from "../../lib/invitation-tracker";
import { trackerButton as button, trackerInput as input, trackerLabel as label, trackerPanel as panel } from "./invitation-tracker-styles";
const focusName = (node: HTMLInputElement | null) => { node?.focus(); };

export function InviteeEditor({ entry, pending, onSave, onCancel }: { entry: Invitee; pending: boolean; onSave: (change: InvitationChange, addAnother?: boolean) => void; onCancel: () => void }) {
  const [name, setName] = useState(entry.guestName), [email, setEmail] = useState(entry.email ?? ""), [phone, setPhone] = useState(entry.phone ?? "");
  const [invited, setInvited] = useState(entry.invited);
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const addAnother = !entry.revision && (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    onSave({ kind: "save", id: entry.id, revision: entry.revision, guestName: name, email, phone, invited }, addAnother);
  }
  return <form onSubmit={save} className={panel} aria-label={entry.revision ? "Edit invitee" : "Add invitee"}>
    <h2 className="font-serif text-2xl">{entry.revision ? "Edit invitee" : "Who’s on your list?"}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">One entry per person or household you’re inviting. This does not create an RSVP.</p>
    <fieldset disabled={pending} className="mt-4 min-w-0 space-y-4">
      <label className={label}>Name or household<input ref={focusName} className={input} name="guestName" autoComplete="off" value={name} onChange={e => setName(e.target.value)} required maxLength={120} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Email <span className="font-normal">(optional)</span><input className={input} name="email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} /></label>
        <label className={label}>Phone <span className="font-normal">(optional)</span><input className={input} name="phone" type="tel" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} /><span className="mt-1 block text-xs font-normal leading-5 text-[#202523]/60">Outside the US/Canada, include + and country code.</span></label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" checked={invited} onChange={e => setInvited(e.target.checked)} />I’ve already sent the invitation</label>
      <div className="flex flex-wrap gap-2"><button type="submit" value="done" className={`${button} bg-[#e9f2f8]`}>{pending ? "Saving…" : entry.revision ? "Save invitee" : "Add invitee"}</button>{!entry.revision && <button type="submit" value="another" className={button}>Save &amp; add another</button>}<button type="button" className={button} onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}
