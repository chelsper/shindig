"use client";
import { useState } from "react";
import { unmatchedResponses, type InvitationChange, type InvitationTracker, type Invitee, type TrackerResponse } from "../../lib/invitation-tracker";
import { trackerButton as button, trackerInput as input, trackerLabel as label, trackerPanel as panel } from "./invitation-tracker-styles";

export const responseLabel = (r: TrackerResponse) => `${r.guestName} · ${r.attending ? `Attending · ${r.partySize} ${r.partySize === 1 ? "guest" : "guests"}` : "Can’t Make It"}`;
const focusMatch = (node: HTMLHeadingElement | null) => { node?.focus(); };
function MatchChoices({ choices, selected, onSelect }: { choices: { id: string; name: string; detail: string }[]; selected: string; onSelect: (id: string) => void }) {
  return <fieldset className="min-w-0 space-y-2"><legend className="mb-2 text-sm font-semibold">Choose a match</legend>
    <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl p-1">{choices.map(choice => <label key={choice.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected === choice.id ? "border-[#355f9e] bg-[#e9f2f8]" : "border-[#202523]/15 bg-white/50"}`}>
      <input type="radio" name="invitation-match" value={choice.id} checked={selected === choice.id} onChange={() => onSelect(choice.id)} className="mt-1 size-4 shrink-0 accent-[#355f9e]" />
      <span className="min-w-0 break-words text-sm"><span className="block font-semibold">{choice.name}</span><span className="mt-1 block text-[#202523]/65">{choice.detail}</span></span>
    </label>)}</div>
  </fieldset>;
}
function Confirmation({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 items-start gap-3 rounded-xl bg-[#e9f2f8] p-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#355f9e]" checked={checked} onChange={e => onChange(e.target.checked)} />I’ve checked this RSVP belongs to this invitee or household.</label>;
}
type Shared = { data: InvitationTracker; pending: boolean; onSave: (change: InvitationChange) => void; onCancel: () => void };
export function MatchResponse({ entry, data, pending, onSave, onCancel }: Shared & { entry: Invitee }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(""), [confirmed, setConfirmed] = useState(false);
  const candidates = unmatchedResponses(data);
  const matches = candidates.filter(r => r.guestName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || r.id === selected);
  const response = candidates.find(r => r.id === selected);
  return <section className={panel} aria-label="Match an RSVP">
    <h2 ref={focusMatch} tabIndex={-1} className="break-words font-serif text-2xl">Link a response to {entry.guestName}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">Choose an existing RSVP from this event. Nothing is matched automatically, and the RSVP itself won’t change. Each response can be linked to one invitation entry.</p>
    <fieldset disabled={pending} className="mt-4 min-w-0 space-y-4">
      <label className={label}>Find a response<input className={input} type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} /></label>
      <MatchChoices choices={matches.map(r => ({ id: r.id, name: r.guestName, detail: r.attending ? `Attending · ${r.partySize} ${r.partySize === 1 ? "guest" : "guests"}` : "Can’t Make It" }))} selected={selected} onSelect={id => { setSelected(id); setConfirmed(false); }} />
      {!matches.length && <p className="text-sm text-[#202523]/65">No unlinked responses match. Try another name, or refresh after the guest replies.</p>}
      {response && <><p className="break-words text-sm font-semibold">{entry.guestName} ↔ {responseLabel(response)}</p><Confirmation checked={confirmed} onChange={setConfirmed} /></>}
      <div className="flex flex-wrap gap-2"><button className={`${button} bg-[#e9f2f8]`} type="button" disabled={!response || !confirmed || pending} onClick={() => { if (response && confirmed && !pending) onSave({ kind: "link", id: entry.id, revision: entry.revision, rsvpId: response.id, confirmed: true }); }}>Confirm RSVP match</button><button className={button} type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </section>;
}

export function MatchInvitee({ response, data, pending, onSave, onCancel }: Shared & { response: TrackerResponse }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(""), [confirmed, setConfirmed] = useState(false);
  const candidates = data.invitees.filter(entry => !entry.response);
  const matches = candidates.filter(entry => entry.guestName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || entry.id === selected);
  const entry = candidates.find(entry => entry.id === selected);
  return <section className={panel} aria-label="Match an invitation">
    <h2 ref={focusMatch} tabIndex={-1} className="break-words font-serif text-2xl">Who did this reply come from?</h2>
    <p className="mt-2 break-words text-sm font-semibold">{responseLabel(response)}</p>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">Choose their invitation entry and confirm the match. Names can differ. Nothing changes the RSVP or creates update permission.</p>
    <fieldset disabled={pending} className="mt-4 min-w-0 space-y-4">
      <label className={label}>Find an invitation<input className={input} type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} /></label>
      <MatchChoices choices={matches.map(i => ({ id: i.id, name: i.guestName, detail: i.invited ? "Invitation sent · no linked response" : "Not marked as invited · no linked response" }))} selected={selected} onSelect={id => { setSelected(id); setConfirmed(false); }} />
      {!matches.length && <p className="text-sm leading-6">No unlinked invitations match. Try another name or cancel and add an invitation entry first. Not every RSVP needs a tracker entry.</p>}
      {entry && <><p className="break-words text-sm font-semibold">{entry.guestName} ↔ {response.guestName}</p><Confirmation checked={confirmed} onChange={setConfirmed} /></>}
      <div className="flex flex-wrap gap-2"><button className={`${button} bg-[#e9f2f8]`} type="button" disabled={!entry || !confirmed || pending} onClick={() => { if (entry && confirmed && !pending) onSave({ kind: "link", id: entry.id, revision: entry.revision, rsvpId: response.id, confirmed: true }); }}>Confirm RSVP match</button><button className={button} type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </section>;
}
