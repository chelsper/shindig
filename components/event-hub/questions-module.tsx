"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import { submitGuestQuestion } from "../../app/event/question-actions";
import { QUESTION_LIMITS, type PublicQuestion } from "../../lib/questions";

export function QuestionsModule({ questions, unavailable = false }: { questions: PublicQuestion[]; unavailable?: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const requestToken = useRef<string | null>(null);
  const askButton = useRef<HTMLButtonElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || unavailable) return;
    submitting.current = true;
    setError(null);
    setSent(false);
    startTransition(async () => {
      try {
        // Reuse on retries, including a lost response after a successful insert.
        requestToken.current ??= crypto.randomUUID();
        const result = await submitGuestQuestion({ question, guestName, requestToken: requestToken.current });
        if (!result.ok) { setError(result.message); return; }
        setSent(true);
        setQuestion("");
        setGuestName("");
        requestToken.current = null;
        setShowForm(false);
        askButton.current?.focus();
      } catch {
        setError("We couldn’t send your question. Please try again in a moment.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <section aria-labelledby="questions-heading" className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
      <div className="border-b border-[#202523]/10 pb-5">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">Before you come over</p>
        <h2 id="questions-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">Ask the Host</h2>
        <p className="mt-2 text-sm leading-6 text-[#202523]/65">Wondering about something? Just ask.</p>
        <button aria-controls="guest-question-form" aria-expanded={showForm} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/80 px-5 text-sm font-semibold text-[#214e91] transition hover:border-[#355f9e] disabled:opacity-50" disabled={unavailable || pending} onClick={() => { setShowForm(!showForm); setError(null); setSent(false); }} ref={askButton} type="button">+ Ask a Question</button>
      </div>
      {sent ? <p className="mt-5 rounded-xl border border-[#285630]/15 bg-[#edf7ed] px-4 py-3 text-sm leading-6 text-[#285630]" role="status">Question sent! The host will take a look. Check back here for any answers they choose to share.</p> : null}
      <div id="guest-question-form" hidden={!showForm}>
        {showForm ? (
          <form className="mt-5 rounded-2xl border border-[#355f9e]/15 bg-[#fffaf1]/85 p-4 sm:p-5" onSubmit={handleSubmit}>
            <fieldset className="space-y-4" disabled={pending}>
              <legend className="sr-only">Ask the host a question</legend>
              <label className="field-label">Your question<textarea autoFocus className="field-input min-h-28 resize-y" maxLength={QUESTION_LIMITS.question} name="question" onChange={(event) => setQuestion(event.target.value)} required rows={3} value={question} /></label>
              <label className="field-label">Your name (optional)<input aria-describedby="question-privacy-note" autoComplete="name" className="field-input" maxLength={QUESTION_LIMITS.guestName} name="guestName" onChange={(event) => setGuestName(event.target.value)} value={guestName} /></label>
              <p className="text-xs leading-5 text-[#202523]/60" id="question-privacy-note">Questions go to the host first. They may share your question and their answer here, but your name stays private. Please leave personal details out of your question.</p>
              {error ? <p className="text-sm leading-6 text-[#843528]" role="alert">{error}</p> : null}
              <button className="primary-button w-full" disabled={pending} type="submit">{pending ? "Sending your question…" : "Send Question"}</button>
            </fieldset>
          </form>
        ) : null}
      </div>
      {unavailable ? (
        <p className="py-9 text-center text-sm leading-6 text-[#202523]/65">Questions are taking a quick break. Please check back soon.</p>
      ) : questions.length === 0 ? (
        <p className="px-2 py-10 text-center font-serif text-2xl leading-snug text-[#202523]/70">Good questions deserve good answers. We’ll share them here.</p>
      ) : (
        <div className="divide-y divide-[#202523]/10">
          {questions.map((item, index) => (
            <details className="group break-words py-2" key={`${item.question}-${index}`}>
              <summary className="min-h-12 cursor-pointer py-4 font-serif text-xl leading-snug text-[#202523] marker:text-[#355f9e]">{item.question}</summary>
              <div className="mb-4 border-l-2 border-[#355f9e]/25 pl-4">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[#355f9e]">From the host</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#202523]/80">{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
