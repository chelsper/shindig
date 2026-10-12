"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { saveHostFaq, deleteGuestQuestion } from "../../app/admin/questions/actions";
import { QUESTION_LIMITS } from "../../lib/questions";
import type { AdminQuestion } from "../../lib/server/questions";
import { useHostEvent } from "./host-event-context";
import { HubContentNextStep } from "./hub-content-next-step";
import { ContentDeleteButton } from "./content-delete-button";

function savedMessage(approved: boolean, live: boolean) {
  return approved ? live ? "FAQ published on the Event Hub." : "FAQ approved and saved privately. It will appear when this section is live."
    : "FAQ saved privately. It is not on the Event Hub.";
}

export function HostFaqEditor({ faq, onSaved, onCancel }: { faq?: AdminQuestion; onSaved: (approved: boolean) => void; onCancel: () => void }) {
  const hostEvent = useHostEvent();
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [approved, setApproved] = useState(faq?.isPublished ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        requestId.current ??= crypto.randomUUID();
        const result = await saveHostFaq(faq?.id ?? requestId.current, faq?.revision ?? 0, { question, answer, isPublished: approved }, ...hostEvent.args);
        if (!result.ok) { setError(result.message); return; }
        onSaved(approved);
      } catch {
        setError("We couldn’t save your FAQ. Please try again. Your text is still here.");
      } finally { submitting.current = false; }
    });
  }

  return <form onSubmit={submit}>
    <fieldset className="space-y-4" disabled={pending}>
      <legend className="sr-only">{faq ? "Edit FAQ" : "Add a FAQ"}</legend>
      <label className="field-label">Question<textarea className="field-input min-h-20 resize-y" name="question" required rows={2} maxLength={QUESTION_LIMITS.question} value={question} onChange={e => setQuestion(e.target.value)} /></label>
      <label className="field-label">Answer<textarea className="field-input min-h-28 resize-y" name="answer" required rows={4} maxLength={QUESTION_LIMITS.answer} value={answer} onChange={e => setAnswer(e.target.value)} /></label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" name="isPublished" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={approved} onChange={e => setApproved(e.target.checked)} /><span>{hostEvent.contentLive ? "Publish this FAQ on the Event Hub" : "Approve this FAQ for when the section is live"}</span></label>
      <p className="text-xs leading-5 text-[#202523]/60">{hostEvent.contentLive ? "Checked FAQs and edits to them appear as soon as you save. Uncheck and save to unpublish." : "Approved FAQs stay private until Ask the Host is enabled and the event is published. Unchecked FAQs stay private even then."} Check your text for personal details before sharing.</p>
      {error ? <p className="text-sm leading-6 text-[#843528]" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="primary-button" disabled={pending}>{pending ? "Saving…" : "Save FAQ & visibility"}</button>
        <button type="button" className="min-h-11 px-4 text-sm text-[#355f9e] underline underline-offset-4" disabled={pending} onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

function HostFaqCard({ faq }: { faq: AdminQuestion }) {
  const hostEvent = useHostEvent();
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  return <li className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7">
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-[#355f9e]">Host-written FAQ</span><span className="rounded-full bg-[#e9f2f8] px-3 py-1">{faq.isPublished ? hostEvent.contentLive ? "Published" : "Approved · Saved privately" : "Private"}</span></div>
    {editing ? <HostFaqEditor faq={faq} onCancel={() => setEditing(false)} onSaved={approved => { setEditing(false); setConfirmation(savedMessage(approved, hostEvent.contentLive)); }} /> : <>
      <h3 className="whitespace-pre-wrap break-words font-serif text-2xl leading-snug">{faq.question}</h3>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#202523]/80">{faq.answer}</p>
      {confirmation ? <><p role="status" className="mt-3 text-sm leading-6 text-[#285630]">{confirmation}</p>{faq.isPublished ? <HubContentNextStep /> : null}</> : null}
      <div className="mt-4 flex flex-wrap items-start gap-2">
        <button className="min-h-11 rounded-full border border-[#355f9e]/25 px-4 text-xs font-semibold text-[#355f9e]" type="button" onClick={() => { setEditing(true); setConfirmation(null); }}>Edit FAQ</button>
        <ContentDeleteButton label="FAQ" onDelete={() => deleteGuestQuestion(faq.id, true, ...hostEvent.args)} />
      </div>
    </>}
  </li>;
}

export function HostFaqsManager({ faqs }: { faqs: AdminQuestion[] }) {
  const { contentLive } = useHostEvent();
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  return <section aria-label="Host-written FAQs" className="space-y-5">
    <div><h2 className="font-serif text-3xl">A few things to know</h2><p className="mt-2 text-sm leading-6 text-[#202523]/65">Answer the practical questions before anyone asks: parking, kids, what to wear, food options, or what you’re providing.</p></div>
    {creating ? <div className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7"><h3 className="mb-5 font-serif text-2xl">A new FAQ</h3><HostFaqEditor onCancel={() => setCreating(false)} onSaved={approved => { setCreating(false); setSaved(approved); }} /></div>
      : <button className="primary-button" type="button" onClick={() => { setCreating(true); setSaved(null); }}>+ Add a FAQ</button>}
    {saved !== null ? <div><p role="status" className="text-sm leading-6 text-[#285630]">{savedMessage(saved, contentLive)}</p>{saved ? <HubContentNextStep /> : null}</div> : null}
    {faqs.length ? <ol aria-label="Prepared FAQs" className="space-y-4">{faqs.map(faq => <HostFaqCard key={faq.id} faq={faq} />)}</ol> : <p className="text-sm leading-6 text-[#202523]/60">No FAQs yet. Add only the details that will help your guests.</p>}
  </section>;
}
