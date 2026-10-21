"use client";
import { useRef, useState, useTransition, type MouseEvent } from "react";
import { EventSetupNavigation } from "./event-setup-navigation";
import { EventGuestsNavigation } from "./event-guests-navigation";
import { changeInvitation, refreshInvitationTracker, type TrackerResult } from "../../app/admin/invitations/actions";
import { filterInvitees, invitationReminder, invitationStatus, INVITATION_STATUS_LABELS, canMarkInvited, unmatchedResponses, MAX_INVITATION_BATCH, type InvitationChange, type InvitationFilter, type InvitationTracker, type Invitee, type TrackerResponse } from "../../lib/invitation-tracker";

import { trackerButton as button, trackerInput as input, trackerLabel as label, trackerPanel as panel } from "./invitation-tracker-styles";
import { InviteeEditor } from "./invitation-entry-editor";
import { MatchResponse, MatchInvitee, responseLabel } from "./invitation-match-picker";

const blankInvitee = (): Invitee => ({ id: crypto.randomUUID(), revision: 0, guestName: "", email: null, phone: null, invited: false, response: null });
const focusReview = (node: HTMLHeadingElement | null) => { node?.focus(); };

export function InvitationTrackerPanel({ initial, title, invitationUrl, eventSlug, workspace, initialResponseId }: { initial: InvitationTracker; title: string; invitationUrl: string | null; eventSlug?: string; workspace?: { id: string; publishedBefore: boolean }; initialResponseId?: string }) {
  const [data, setData] = useState(initial), [filter, setFilter] = useState<InvitationFilter>("all"), [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ mode: "edit" | "link" | "remove"; entry: Invitee } | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [bulkReview, setBulkReview] = useState(false);
  const [matchingResponse, setMatchingResponse] = useState<TrackerResponse | null>(unmatchedResponses(initial).find(r => r.id === initialResponseId) ?? null);
  const [responseQuery, setResponseQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null), [fallback, setFallback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition(), busy = useRef(false);
  const editing = !!editor || !!matchingResponse || bulkReview;
  const selectedEntries = data.invitees.filter(entry => selected.includes(entry.id) && canMarkInvited(entry));
  const unmatched = unmatchedResponses(data);
  const shownResponses = unmatched.filter(r => r.guestName.toLocaleLowerCase().includes(responseQuery.trim().toLocaleLowerCase()));
  const linkedEntry = initialResponseId ? data.invitees.find(entry => entry.response?.id === initialResponseId) : undefined;
  const shown = filterInvitees(data.invitees, filter, query);
  const counts = { "not-sent": 0, waiting: 0, responded: 0 };
  for (const entry of data.invitees) counts[invitationStatus(entry)]++;
  function run(action: () => Promise<TrackerResult>, message: string, addAnother = false) {
    if (busy.current) return;
    busy.current = true; setNotice(null); setFallback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) { setNotice(result.message); return; }
        setData(result.data); setEditor(addAnother ? { mode: "edit", entry: blankInvitee() } : null); setMatchingResponse(null); setSelected([]); setBulkReview(false); setNotice(message);
      } catch { setNotice("The tracker couldn’t update. Refresh before retrying; your RSVP responses are unchanged."); }
      finally { busy.current = false; }
    });
  }
  function save(change: InvitationChange, addAnother = false) {
    const message = change.kind === "sent-many" ? `${change.entries.length} ${change.entries.length === 1 ? "invitation" : "invitations"} marked as invited. Nothing was sent by Shindig.` : change.kind === "link" ? "RSVP linked. No response or contact permissions were changed." : change.kind === "unlink" ? "Match removed. The RSVP is unchanged." : change.kind === "remove" ? "Invitee and their tracker contact details removed. RSVPs and guest opt-ins are unchanged." : change.kind === "sent" ? (change.invited ? "Marked as invited. Nothing was sent by Shindig." : "Marked as not sent.") : "Invitee saved. No RSVP or update opt-in was created.";
    run(() => changeInvitation(change, eventSlug), addAnother ? "Invitee saved. Add the next household below; contact details and sent status start fresh." : message, addAnother);
  }
  async function copy(text: string) {
    setNotice(null);
    try { await navigator.clipboard.writeText(text); setFallback(null); setNotice("Copied. Paste into your own app — nothing has been sent or marked as invited."); }
    catch { setFallback(text); setNotice("Select and copy the text below. Nothing has been sent."); }
  }
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (busy.current || (editing && !window.confirm("Leave without finishing this invitation entry?"))) event.preventDefault();
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
      <button type="button" className={`${button} bg-[#e9f2f8]`} disabled={pending || editing} onClick={() => { setNotice(null); setEditor({ mode: "edit", entry: blankInvitee() }); }}>+ Add invitee</button>
      <button type="button" className={button} disabled={pending || editing} onClick={() => run(() => refreshInvitationTracker(eventSlug), "Tracker refreshed.")}>{pending ? "Working…" : "Refresh tracker"}</button>
    </div>
    {notice && <p role="status" className="rounded-xl bg-[#e9f2f8] p-4 text-sm leading-6">{notice}</p>}
    {fallback !== null && <label className={label}>Select to copy<textarea className={`${input} min-h-32`} readOnly value={fallback} onFocus={e => e.target.select()} /></label>}
    {matchingResponse && <MatchInvitee key={matchingResponse.id} response={matchingResponse} data={data} pending={pending} onSave={save} onCancel={() => setMatchingResponse(null)} />}
    {linkedEntry && <p className="rounded-xl bg-[#e9f2f8] p-4 text-sm">This RSVP is linked to <a className="inline-flex min-h-11 items-center font-semibold underline" href={`#invitee-${linkedEntry.id}`} onClick={() => { setFilter("all"); setQuery(""); }}>{linkedEntry.guestName}</a>.</p>}
    {bulkReview && <section className={panel} aria-label="Confirm invited selections"><h2 ref={focusReview} tabIndex={-1} className="font-serif text-xl">Mark {selectedEntries.length} selected {selectedEntries.length === 1 ? "invitation" : "invitations"} as invited?</h2><p className="mt-2 text-sm leading-6">Confirm that you have already sent these invitations using your own app. Shindig sends nothing and creates no RSVPs or update permissions.</p><ul className="my-3 max-h-48 overflow-y-auto text-sm">{selectedEntries.map(entry => <li className="break-words py-1" key={entry.id}>{entry.guestName}</li>)}</ul><div className="flex flex-wrap gap-2"><button className={`${button} bg-[#e9f2f8]`} type="button" disabled={pending || !selectedEntries.length} onClick={() => save({ kind: "sent-many", entries: selectedEntries.map(({ id, revision }) => ({ id, revision })), confirmed: true })}>Yes, I’ve sent these invitations</button><button className={button} type="button" disabled={pending} onClick={() => setBulkReview(false)}>Cancel</button></div></section>}
    {editor?.mode === "edit" && <InviteeEditor key={editor.entry.id} entry={editor.entry} pending={pending} onSave={save} onCancel={() => setEditor(null)} />}
    {editor?.mode === "link" && <MatchResponse key={editor.entry.id} entry={editor.entry} data={data} pending={pending} onSave={save} onCancel={() => setEditor(null)} />}
    {editor?.mode === "remove" && <section className={panel} aria-label="Confirm invitee removal"><h2 className="break-words font-serif text-xl">Remove {editor.entry.guestName}?</h2><p className="mt-2 text-sm leading-6">This permanently removes this invitation entry and its stored contact details. Any RSVP and separately collected update permissions stay unchanged.</p><div className="mt-3 flex flex-wrap gap-2"><button className={button} type="button" disabled={pending} onClick={() => save({ kind: "remove", id: editor.entry.id, revision: editor.entry.revision, confirmed: true })}>Yes, remove invitee</button><button className={button} type="button" disabled={pending} onClick={() => setEditor(null)}>Cancel</button></div></section>}
    <nav className="flex flex-wrap gap-2" aria-label="Filter invitations">{(["all", "not-sent", "waiting", "responded"] as const).map(value => <button key={value} type="button" className={`${button} ${filter === value ? "bg-[#e9f2f8]" : ""}`} aria-pressed={filter === value} disabled={pending || editing} onClick={() => { setFilter(value); setSelected([]); }}>{value === "all" ? "All" : INVITATION_STATUS_LABELS[value]}</button>)}</nav>
    <label className={label}>Find an invitee<input className={input} type="search" maxLength={254} autoComplete="off" value={query} disabled={pending || editing} onChange={e => { setQuery(e.target.value); setSelected([]); }} placeholder="Name, email or phone" /></label>
    <section aria-label="Selected invitations" className="rounded-xl bg-[#e9f2f8]/60 p-4 text-sm">
      <p>Select unsent invitations below to mark them together (up to {MAX_INVITATION_BATCH}). Nothing is selected automatically.</p>
      {selectedEntries.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2"><span role="status" className="font-semibold">{selectedEntries.length} selected</span><button className={button} disabled={pending || editing} type="button" onClick={() => setBulkReview(true)}>Mark selected as invited</button><button className={button} disabled={pending || editing} type="button" onClick={() => setSelected([])}>Clear selection</button></div>}
    </section>
    {!shown.length ? <p className="rounded-2xl border border-dashed border-[#202523]/20 p-6 text-sm leading-6 text-[#202523]/65">{data.invitees.length ? "No invitees match this view." : "Start with the people you’re planning to invite. Your RSVP responses stay separate until you choose a match."}</p> : <ul className="space-y-3" aria-label="Private invitees">{shown.map(entry => <li className={`${panel} scroll-mt-6`} id={`invitee-${entry.id}`} key={entry.id}>
      {canMarkInvited(entry) && <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" aria-label={`Select ${entry.guestName} to mark invited`} checked={selected.includes(entry.id)} disabled={pending || editing || (!selected.includes(entry.id) && selected.length >= MAX_INVITATION_BATCH)} onChange={e => setSelected(e.target.checked ? [...selected, entry.id] : selected.filter(id => id !== entry.id))} />Select invitation</label>}
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-words font-serif text-2xl">{entry.guestName}</h2><span className="rounded-full bg-[#e9f2f8] px-3 py-1 text-xs">{INVITATION_STATUS_LABELS[invitationStatus(entry)]}</span></div>
      {entry.email && <p className="mt-2 break-all text-sm text-[#202523]/70">{entry.email}</p>}{entry.phone && <p className="mt-1 break-all text-sm text-[#202523]/70">{entry.phone}</p>}
      {entry.response && <p className="mt-3 break-words rounded-xl bg-[#e9f2f8]/50 p-3 text-sm">Linked RSVP: {responseLabel(entry.response)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!entry.response && <button type="button" className={button} disabled={pending || editing} onClick={() => save({ kind: "sent", id: entry.id, revision: entry.revision, invited: !entry.invited })}>{entry.invited ? "Mark not sent" : "Mark invited"}</button>}
        <button type="button" className={button} disabled={pending || editing} onClick={() => entry.response ? save({ kind: "unlink", id: entry.id, revision: entry.revision }) : setEditor({ mode: "link", entry })}>{entry.response ? "Unlink RSVP" : "Link RSVP"}</button>
        <button type="button" className={button} disabled={pending || editing} onClick={() => setEditor({ mode: "edit", entry })}>Edit</button>
        <button type="button" className={button} disabled={pending || editing} onClick={() => setEditor({ mode: "remove", entry })}>Remove</button>
      </div>
    </li>)}</ul>}
    {data.responses.length > 0 && <section className={panel} aria-label="Unmatched RSVP responses">
      <h2 className="font-serif text-2xl">Replies to match <span className="text-[#355f9e]">({unmatched.length})</span></h2>
      <p className="mt-2 text-sm leading-6 text-[#202523]/65">These replies aren’t linked to an invitation entry. Match only when you’re sure. Every RSVP already counts, even without a match.</p>
      {unmatched.length > 0 ? <><label className={`${label} mt-4`}>Find an unmatched reply<input className={input} type="search" maxLength={120} value={responseQuery} onChange={e => setResponseQuery(e.target.value)} /></label><ul className="mt-3 max-h-96 space-y-2 overflow-y-auto p-1">{shownResponses.map(response => <li key={response.id} className="rounded-xl border border-[#202523]/10 p-3"><p className="break-words text-sm font-semibold">{responseLabel(response)}</p><button className={`${button} mt-2`} type="button" disabled={pending || editing} onClick={() => { setNotice(null); setMatchingResponse(response); }}>Match invitation for {response.guestName}</button></li>)}</ul>{!shownResponses.length && <p className="mt-3 text-sm">No unmatched replies match this name.</p>}</> : <p className="mt-3 text-sm">All current replies have a linked invitation.</p>}
    </section>}
    <p className="text-xs leading-5 text-[#202523]/60">Keep contact details only as long as needed for this gathering. Remove entries when you’re done, and delete any copies you keep in other apps. Invitees are never copied into new events.</p>
  </div>;
}
