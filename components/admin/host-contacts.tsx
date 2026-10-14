"use client";
import { useState, useTransition } from "react";
import { cleanUpContacts, refreshContacts } from "../../app/admin/contacts/actions";
import type { HostContacts } from "../../lib/server/rsvp-contacts";

export function HostContactsPanel({ initial, title, eventSlug }: { initial: HostContacts; title: string; eventSlug?: string }) {
  const [data, setData] = useState(initial), [channel, setChannel] = useState<"email" | "phone">("email");
  const [filter, setFilter] = useState<"all" | "attending" | "declined">("all");
  const [message, setMessage] = useState(`Hi! A quick update about ${title}: `), [notice, setNotice] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null), [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const selected = (source: HostContacts) => source.contacts.filter((c) => c[channel] && (filter === "all" || c.attending === (filter === "attending")));
  const contacts = selected(data);
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice("Copied. Paste into your own messaging app — nothing has been sent."); setFallback(null); }
    catch { setFallback(text); setNotice("Copy wasn’t available here. Select and copy the text below."); }
  }
  function copyRecipients() {
    setNotice(null); setFallback(null);
    startTransition(async () => {
      try {
        // Reauthorize and refresh before copying, including recent withdrawals.
        const result = await refreshContacts(eventSlug);
        if (!result.ok) { setNotice(result.message); return; }
        setData(result.data);
        const recipients = [...new Set(selected(result.data).map((c) => c[channel]!))];
        if (!recipients.length) { setNotice("No opted-in contacts match this selection now."); return; }
        await copy(recipients.join(channel === "email" ? ", " : "; "));
      } catch { setNotice("Contacts couldn’t refresh. Please try again."); }
    });
  }
  function cleanup() {
    if (!confirm) return;
    setNotice(null); setFallback(null);
    startTransition(async () => {
      try {
        const result = await cleanUpContacts(true, eventSlug);
        if (!result.ok) { setNotice(result.message); return; }
        setData({ contacts: [], collectionClosed: true }); setConfirm(false);
        setNotice("Contact details removed and collection ended. RSVPs are unchanged.");
      } catch { setNotice("Contacts couldn’t be cleared. Please try again."); }
    });
  }
  return <div className="contact-preferences space-y-5">
    <section className="rounded-2xl border border-[#355f9e]/15 bg-[#e9f2f8]/50 p-5 text-sm leading-6">
      <h2 className="font-semibold">For this gathering only</h2>
      <p className="mt-1">Only guests who chose text or email updates appear here. Contact details are private to the host and are not verified. Shindig does not send messages.</p>
      <p className="mt-2">Use Bcc for email. Send texts individually or use a recipient-private messaging option; group texts can reveal everyone’s number. Honor opt-outs and delete any copies you keep when they’re no longer needed.</p>
    </section>
    {data.collectionClosed ? <p className="rounded-2xl bg-[#fffaf1] p-5 text-sm leading-6">Contact collection has ended for this event. RSVP responses and guest counts are unchanged.</p> : <>
      <section className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5">
        <div className="flex flex-wrap gap-2" aria-label="Contact channel">{([['email', 'Email'], ['phone', 'Text']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={value === channel} disabled={pending} className={`min-h-11 rounded-full border px-5 text-sm ${value === channel ? "border-[#355f9e] bg-[#e9f2f8]" : "border-[#202523]/15"}`} onClick={() => { setChannel(value); setFallback(null); }}>{label}</button>)}</div>
        <label className="field-label mt-4">Include<select className="field-input" disabled={pending} value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setFallback(null); }}><option value="all">All opted-in guests</option><option value="attending">Attending</option><option value="declined">Can’t Make It</option></select></label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{contacts.length} opted-in {contacts.length === 1 ? "response" : "responses"}</p><button className="min-h-11 rounded-full border border-[#355f9e]/30 px-4 text-sm text-[#214e91]" type="button" disabled={pending} onClick={copyRecipients}>{pending ? "Working…" : channel === "email" ? "Copy email recipients" : "Copy text recipients"}</button></div>
        <p className="mt-2 text-xs text-[#202523]/60">Recipients refresh before copying. Duplicate addresses or numbers are copied once.</p>
        {contacts.length ? <ul className="mt-3 divide-y divide-[#202523]/10">{contacts.map((contact, index) => <li key={index} className="py-3"><p className="text-sm font-semibold">{contact.guestName}</p><p className="break-all text-sm text-[#202523]/70">{contact[channel]}</p><p className="mt-1 text-xs text-[#202523]/55">{contact.attending ? "Attending" : "Can’t Make It"} · Guest opted in to {channel === "email" ? "email" : "text"} updates</p></li>)}</ul> : <p className="mt-5 text-sm leading-6 text-[#202523]/65">No guests have shared contact details for this selection yet. They can opt in when they RSVP or through their private update link.</p>}
      </section>
      <section className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5">
        <label className="field-label">Your message<textarea className="field-input min-h-32 resize-y py-3" maxLength={2000} value={message} onChange={(e) => { setMessage(e.target.value); setFallback(null); }} /></label>
        <p className="mt-2 text-xs leading-5 text-[#202523]/60">This draft stays on this page; it isn’t stored or sent.</p>
        <button type="button" disabled={!message.trim() || pending} className="mt-3 min-h-11 rounded-full border border-[#355f9e]/30 px-4 text-sm text-[#214e91]" onClick={() => { void copy(message.trim()); }}>Copy message</button>
      </section>
      <section className="rounded-2xl border border-[#202523]/10 p-5 text-sm leading-6">
        <h2 className="font-semibold">After the gathering</h2><p className="mt-1 text-[#202523]/65">Clear this event’s phone numbers, email addresses and permission timestamps when you’re done with updates. This also ends contact collection so old forms cannot add them back. RSVPs stay intact. This cannot be undone.</p>
        <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" disabled={pending} checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Clear contact details and end collection for this event</label>
        <button type="button" disabled={!confirm || pending} className="mt-2 min-h-11 rounded-full border border-[#843528]/30 px-4 text-sm text-[#843528] disabled:opacity-40" onClick={cleanup}>Clear event contacts</button>
      </section>
    </>}
    {notice && <p role="status" className="rounded-xl bg-[#e9f2f8] p-4 text-sm leading-6">{notice}</p>}
    {fallback !== null && <label className="field-label">Select to copy<textarea readOnly className="field-input min-h-28 py-3" value={fallback} onFocus={(e) => e.target.select()} /></label>}
  </div>;
}
