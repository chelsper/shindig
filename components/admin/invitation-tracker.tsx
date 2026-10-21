"use client";
import { useRef, useState, useTransition, type FormEvent, type MouseEvent } from "react";
import { EventSetupNavigation } from "./event-setup-navigation";
import { EventGuestsNavigation } from "./event-guests-navigation";
import { changeInvitation, refreshInvitationTracker, type TrackerResult } from "../../app/admin/invitations/actions";
import { filterInvitees, invitationReminder, invitationStatus, INVITATION_STATUS_LABELS, type InvitationChange, type InvitationFilter, type InvitationTracker, type Invitee, type TrackerResponse } from "../../lib/invitation-tracker";

const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/30 px-4 text-sm text-[#214e91] disabled:opacity-40";
const input = "tracker-input mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#202523]/20 bg-white/70 px-3 py-2 text-base font-normal text-[#202523]";
const label = "block text-sm font-semibold";
const panel = "rounded-2xl border border-[#202523]/15 bg-[#fffaf1] p-5";
const responseLabel = (r: TrackerResponse) => `${r.guestName} · ${r.attending ? `Attending · ${r.partySize} ${r.partySize === 1 ? "guest" : "guests"}` : "Can’t Make It"}`;

function InviteeEditor({ entry, pending, onSave, onCancel }: { entry: Invitee; pending: boolean; onSave: (change: InvitationChange) => void; onCancel: () => void }) {
  const [name, setName] = useState(entry.guestName), [email, setEmail] = useState(entry.email ?? ""), [phone, setPhone] = useState(entry.phone ?? "");
  const [invited, setInvited] = useState(entry.invited);
  function save(e: FormEvent) {
    e.preventDefault();
    onSave({ kind: "save", id: entry.id, revision: entry.revision, guestName: name, email, phone, invited });
  }
  return <form onSubmit={save} className={panel} aria-label={entry.revision ? "Edit invitee" : "Add invitee"}>
    <h2 className="font-serif text-2xl">{entry.revision ? "Edit invitee" : "Who’s on your list?"}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">One entry per person or household you’re inviting. This does not create an RSVP.</p>
    <fieldset disabled={pending} className="mt-4 min-w-0 space-y-4">
      <label className={label}>Name or household<input className={input} name="guestName" autoComplete="off" value={name} onChange={e => setName(e.target.value)} required maxLength={120} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Email <span className="font-normal">(optional)</span><input className={input} name="email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} /></label>
        <label className={label}>Phone <span className="font-normal">(optional)</span><input className={input} name="phone" type="tel" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} /><span className="mt-1 block text-xs font-normal leading-5 text-[#202523]/60">Outside the US/Canada, include + and country code.</span></label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" checked={invited} onChange={e => setInvited(e.target.checked)} />I’ve already sent the invitation</label>
      <div className="flex flex-wrap gap-2"><button type="submit" className={`${button} bg-[#e9f2f8]`}>{pending ? "Saving…" : entry.revision ? "Save invitee" : "Add invitee"}</button><button type="button" className={button} onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}

function MatchResponse({ entry, data, pending, onSave, onCancel }: { entry: Invitee; data: InvitationTracker; pending: boolean; onSave: (change: InvitationChange) => void; onCancel: () => void }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(""), [confirmed, setConfirmed] = useState(false);
  const used = new Set(data.invitees.filter(i => i.id !== entry.id).flatMap(i => i.response ? [i.response.id] : []));
  const candidates = data.responses.filter(r => !used.has(r.id));
  const matches = candidates.filter(r => r.guestName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || r.id === selected);
  const response = candidates.find(r => r.id === selected);
  return <section className={panel} aria-label="Match an RSVP">
    <h2 className="break-words font-serif text-2xl">Link a response to {entry.guestName}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">Choose an existing RSVP from this event. Nothing is matched automatically, and the RSVP itself won’t change. Each response can be linked to one invitation entry.</p>
    <fieldset disabled={pending} className="mt-4 min-w-0 space-y-4">
      <label className={label}>Find a response<input className={input} type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} /></label>
      <label className={label}>RSVP response<select className={input} value={selected} onChange={e => { setSelected(e.target.value); setConfirmed(false); }}><option value="">Choose a response</option>{matches.map(r => <option key={r.id} value={r.id}>{responseLabel(r)}</option>)}</select></label>
      {!matches.length && <p className="text-sm text-[#202523]/65">No unlinked responses match. Try another name, or refresh after the guest replies.</p>}
      {response && <div className="rounded-xl bg-[#e9f2f8] p-4"><p className="break-words text-sm font-semibold">{responseLabel(response)}</p><label className="mt-2 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I’ve checked this RSVP belongs to this invitee or household.</label></div>}
      <div className="flex flex-wrap gap-2"><button className={`${button} bg-[#e9f2f8]`} type="button" disabled={!response || !confirmed || pending} onClick={() => { if (response && confirmed) onSave({ kind: "link", id: entry.id, revision: entry.revision, rsvpId: response.id, confirmed: true }); }}>Confirm RSVP match</button><button className={button} type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </section>;
}

export function InvitationTrackerPanel({ initial, title, invitationUrl, eventSlug, workspace }: { initial: InvitationTracker; title: string; invitationUrl: string | null; eventSlug?: string; workspace?: { id: string; publishedBefore: boolean } }) {
  const [data, setData] = useState(initial), [filter, setFilter] = useState<InvitationFilter>("all"), [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ mode: "edit" | "link" | "remove"; entry: Invitee } | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [fallback, setFallback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition(), busy = useRef(false);
  const shown = filterInvitees(data.invitees, filter, query);
  const counts = { "not-sent": 0, waiting: 0, responded: 0 };
  for (const entry of data.invitees) counts[invitationStatus(entry)]++;
  function run(action: () => Promise<TrackerResult>, message: string) {
    if (busy.current) return;
    busy.current = true; setNotice(null); setFallback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) { setNotice(result.message); return; }
        setData(result.data); setEditor(null); setNotice(message);
      } catch { setNotice("The tracker couldn’t update. Refresh before retrying; your RSVP responses are unchanged."); }
      finally { busy.current = false; }
    });
  }
  function save(change: InvitationChange) {
    const message = change.kind === "link" ? "RSVP linked. No response or contact permissions were changed." : change.kind === "unlink" ? "Match removed. The RSVP is unchanged." : change.kind === "remove" ? "Invitee and their tracker contact details removed. RSVPs and guest opt-ins are unchanged." : change.kind === "sent" ? (change.invited ? "Marked as invited. Nothing was sent by Shindig." : "Marked as not sent.") : "Invitee saved. No RSVP or update opt-in was created.";
    run(() => changeInvitation(change, eventSlug), message);
  }
  async function copy(text: string) {
    setNotice(null);
    try { await navigator.clipboard.writeText(text); setFallback(null); setNotice("Copied. Paste into your own app — nothing has been sent or marked as invited."); }
    catch { setFallback(text); setNotice("Select and copy the text below. Nothing has been sent."); }
  }
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (busy.current || (editor && !window.confirm("Leave without finishing this invitation entry?"))) event.preventDefault();
  }
  return <div className="space-y-5 pb-8">
    {workspace && <><EventSetupNavigation id={workspace.id} current="guests" onNavigate={leave} /><EventGuestsNavigation id={workspace.id} current="invitations" publishedBefore={workspace.publishedBefore} onNavigate={leave} /></>}
    <section className="rounded-2xl border border-[#355f9e]/15 bg-[#e9f2f8]/50 p-5 text-sm leading-6">
      <h2 className="font-semibold">Your list, just for this gathering</h2>
      <p className="mt-1">Keep track of invitations you send yourself. Names and contact details stay private to you; they never appear on the public guest list.</p>
      <p className="mt-2">Adding someone is not an RSVP or permission for updates. Guest-approved update contacts stay in Private contacts. Shindig does not send messages.</p>
    </section>
    <dl className="grid grid-cols-3 gap-2" aria-label="Invitation totals">{(["not-sent", "waiting", "responded"] as const).map(status => <div className="min-w-0 rounded-2xl bg-[#fffaf1] p-3" key={status}><dt className="min-h-10 text-xs leading-5 text-[#202523]/65">{INVITATION_STATUS_LABELS[status]}</dt><dd className="mt-1 font-serif text-3xl text-[#355f9e]">{counts[status]}</dd></div>)}</dl>
    <p className="text-xs leading-5 text-[#202523]/60">{data.invitees.length} invitation {data.invitees.length === 1 ? "entry" : "entries"}, not a guest count. “Responded” includes attending and declined RSVPs you’ve explicitly linked.</p>
    <section className={panel} aria-label="Send using your own apps">
      <h2 className="font-serif text-xl">A little nudge, your way</h2>
      <p className="mt-2 text-sm leading-6 text-[#202523]/65">Send privately using your usual text or email app. After sending, mark the entry as invited. Copying alone never changes its status.</p>
      {invitationUrl ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void copy(invitationUrl)}>Copy invitation link</button><button type="button" className={button} onClick={() => void copy(invitationReminder(title, invitationUrl))}>Copy reminder message</button></div> : <p className="mt-3 text-sm text-[#765319]">You can prepare your list now. Publish the event to make its invitation link available.</p>}
    </section>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={`${button} bg-[#e9f2f8]`} disabled={pending || editor !== null} onClick={() => { setNotice(null); setEditor({ mode: "edit", entry: { id: crypto.randomUUID(), revision: 0, guestName: "", email: null, phone: null, invited: false, response: null } }); }}>+ Add invitee</button>
      <button type="button" className={button} disabled={pending || !!editor} onClick={() => run(() => refreshInvitationTracker(eventSlug), "Tracker refreshed.")}>{pending ? "Working…" : "Refresh tracker"}</button>
    </div>
    {notice && <p role="status" className="rounded-xl bg-[#e9f2f8] p-4 text-sm leading-6">{notice}</p>}
    {fallback !== null && <label className={label}>Select to copy<textarea className={`${input} min-h-32`} readOnly value={fallback} onFocus={e => e.target.select()} /></label>}
    {editor?.mode === "edit" && <InviteeEditor key={editor.entry.id} entry={editor.entry} pending={pending} onSave={save} onCancel={() => setEditor(null)} />}
    {editor?.mode === "link" && <MatchResponse key={editor.entry.id} entry={editor.entry} data={data} pending={pending} onSave={save} onCancel={() => setEditor(null)} />}
    {editor?.mode === "remove" && <section className={panel} aria-label="Confirm invitee removal"><h2 className="break-words font-serif text-xl">Remove {editor.entry.guestName}?</h2><p className="mt-2 text-sm leading-6">This permanently removes this invitation entry and its stored contact details. Any RSVP and separately collected update permissions stay unchanged.</p><div className="mt-3 flex flex-wrap gap-2"><button className={button} type="button" disabled={pending} onClick={() => save({ kind: "remove", id: editor.entry.id, revision: editor.entry.revision, confirmed: true })}>Yes, remove invitee</button><button className={button} type="button" disabled={pending} onClick={() => setEditor(null)}>Cancel</button></div></section>}
    <nav className="flex flex-wrap gap-2" aria-label="Filter invitations">{(["all", "not-sent", "waiting", "responded"] as const).map(value => <button key={value} type="button" className={`${button} ${filter === value ? "bg-[#e9f2f8]" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : INVITATION_STATUS_LABELS[value]}</button>)}</nav>
    <label className={label}>Find an invitee<input className={input} type="search" maxLength={254} autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, email or phone" /></label>
    {!shown.length ? <p className="rounded-2xl border border-dashed border-[#202523]/20 p-6 text-sm leading-6 text-[#202523]/65">{data.invitees.length ? "No invitees match this view." : "Start with the people you’re planning to invite. Your RSVP responses stay separate until you choose a match."}</p> : <ul className="space-y-3" aria-label="Private invitees">{shown.map(entry => <li className={panel} key={entry.id}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-words font-serif text-2xl">{entry.guestName}</h2><span className="rounded-full bg-[#e9f2f8] px-3 py-1 text-xs">{INVITATION_STATUS_LABELS[invitationStatus(entry)]}</span></div>
      {entry.email && <p className="mt-2 break-all text-sm text-[#202523]/70">{entry.email}</p>}{entry.phone && <p className="mt-1 break-all text-sm text-[#202523]/70">{entry.phone}</p>}
      {entry.response && <p className="mt-3 break-words rounded-xl bg-[#e9f2f8]/50 p-3 text-sm">Linked RSVP: {responseLabel(entry.response)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!entry.response && <button type="button" className={button} disabled={pending || !!editor} onClick={() => save({ kind: "sent", id: entry.id, revision: entry.revision, invited: !entry.invited })}>{entry.invited ? "Mark not sent" : "Mark invited"}</button>}
        <button type="button" className={button} disabled={pending || !!editor} onClick={() => entry.response ? save({ kind: "unlink", id: entry.id, revision: entry.revision }) : setEditor({ mode: "link", entry })}>{entry.response ? "Unlink RSVP" : "Link RSVP"}</button>
        <button type="button" className={button} disabled={pending || !!editor} onClick={() => setEditor({ mode: "edit", entry })}>Edit</button>
        <button type="button" className={button} disabled={pending || !!editor} onClick={() => setEditor({ mode: "remove", entry })}>Remove</button>
      </div>
    </li>)}</ul>}
    <p className="text-xs leading-5 text-[#202523]/60">Keep contact details only as long as needed for this gathering. Remove entries when you’re done, and delete any copies you keep in other apps. Invitees are never copied into new events.</p>
  </div>;
}
