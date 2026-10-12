"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { answerGuestQuestion, deleteGuestQuestion } from "../../app/admin/questions/actions";
import { useHostEvent } from "./host-event-context";
import { HubContentNextStep } from "./hub-content-next-step";
import { QUESTION_LIMITS } from "../../lib/questions";
import type { AdminQuestion } from "../../lib/server/questions";
import { ContentDeleteButton } from "./content-delete-button";
import { HostFaqsManager } from "./host-faqs-manager";

function HostQuestionCard({ question }: { question: AdminQuestion }) {
  const hostEvent = useHostEvent();
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [isPublished, setIsPublished] = useState(question.isPublished);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setConfirmation(null);
    startTransition(async () => {
      try {
        const result = await answerGuestQuestion(question.id, { answer, isPublished }, ...hostEvent.args);
        if (!result.ok) { setError(result.message); return; }
        setConfirmation(isPublished ? hostEvent.contentLive ? "Question and answer published." : "Answer approved and saved privately. It will appear when this section is live." : "Saved privately. This question is not on the Event Hub.");
      } catch {
        setError("We couldn’t save your answer. Please try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <li className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 font-semibold ${question.isPublished ? "bg-[#dcebdc] text-[#285630]" : "bg-[#e9f2f8] text-[#355f9e]"}`}>{question.isPublished ? hostEvent.contentLive ? "Published" : "Approved · Saved privately" : "Private"}</span>
        <span className="text-[#202523]/55">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: hostEvent.timeZone }).format(new Date(question.createdAt))}</span>
      </div>
      <h2 className="whitespace-pre-wrap break-words font-serif text-2xl leading-snug">{question.question}</h2>
      <p className="mt-2 break-words text-xs leading-5 text-[#202523]/60">{question.guestName ? `From ${question.guestName} · Name visible only to you` : "No name provided"}</p>
      <form className="mt-5" onSubmit={submit}>
        <fieldset className="space-y-4" disabled={pending}>
          <legend className="sr-only">Answer and publication</legend>
          <label className="field-label">Your answer<textarea className="field-input min-h-28 resize-y" maxLength={QUESTION_LIMITS.answer} name="answer" onChange={(event) => { setAnswer(event.target.value); setConfirmation(null); }} required={isPublished} rows={3} value={answer} /></label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input checked={isPublished} className="mt-1 size-5 shrink-0 accent-[#355f9e]" name="isPublished" onChange={(event) => { setIsPublished(event.target.checked); setConfirmation(null); }} type="checkbox" /><span>{hostEvent.contentLive ? "Publish this question and answer on the Event Hub" : "Approve this question and answer for when the section is live"}</span></label>
          <p className="text-xs leading-5 text-[#202523]/60">{hostEvent.contentLive ? "An answer is required to publish. Uncheck and save to unpublish." : "An answer is required for approval. Uncheck and save to keep it private even when this section goes live."} Guest names are never included; check the question itself for personal details before sharing.</p>
          {error ? <p className="text-sm text-[#843528]" role="alert">{error}</p> : null}
          {confirmation ? <><p className="text-sm leading-6 text-[#285630]" role="status">{confirmation}</p><HubContentNextStep /></> : null}
          <button className="primary-button" disabled={pending} type="submit">{pending ? "Saving…" : "Save answer & visibility"}</button>
        </fieldset>
      </form>
      <div className="mt-4 border-t border-[#202523]/10 pt-4"><ContentDeleteButton label="question and its answer" onDelete={() => deleteGuestQuestion(question.id, true, ...hostEvent.args)} /></div>
    </li>
  );
}

export function HostQuestionsManager({ questions }: { questions: AdminQuestion[] }) {
  const guests = questions.filter(question => question.source !== "host");
  return <div className="space-y-9">
    <HostFaqsManager faqs={questions.filter(question => question.source === "host")} />
    <section aria-label="Questions from guests" className="border-t border-[#202523]/15 pt-7">
      <h2 className="mb-5 font-serif text-3xl">Questions from guests</h2>
      {guests.length === 0 ? <p className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/85 px-5 py-10 text-center font-serif text-2xl text-[#202523]/70">No questions yet. You’re all caught up.</p>
        : <ol aria-label="Guest questions" className="space-y-5">{guests.map((question) => <HostQuestionCard key={question.id} question={question} />)}</ol>}
    </section>
  </div>;
}
