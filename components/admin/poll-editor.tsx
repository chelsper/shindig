"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { saveHostPoll } from "../../app/admin/polls/actions";
import { POLL_LIMITS, type AdminPoll, type PollOption } from "../../lib/polls";

export function PollEditor({ poll, onSaved, onCancel }: { poll?: AdminPoll; onSaved: () => void; onCancel: () => void }) {
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [eyebrow, setEyebrow] = useState(poll?.eyebrow ?? "IMPORTANT RESEARCH");
  const [options, setOptions] = useState<PollOption[]>(poll?.options ?? [{ key: "", text: "" }, { key: "", text: "" }]);
  const [multiple, setMultiple] = useState(poll?.allowMultiple ?? false);
  const [showResults, setShowResults] = useState(poll?.showResults ?? true);
  const [closedResults, setClosedResults] = useState(poll?.showClosedResults ?? true);
  const [order, setOrder] = useState(poll?.sortOrder ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const requestKey = useRef<string | null>(poll?.key ?? null);
  const locked = poll?.votingStarted ?? false;

  function move(index: number, delta: number) {
    setOptions((previous) => {
      const next = [...previous];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setError(null);
    startTransition(async () => {
      try {
        requestKey.current ??= crypto.randomUUID();
        const keyedOptions = options.map((option) => ({ ...option, key: option.key || crypto.randomUUID() }));
        setOptions(keyedOptions);
        const result = await saveHostPoll(requestKey.current, { question, eyebrow, options: keyedOptions, allowMultiple: multiple, showResults, showClosedResults: closedResults, sortOrder: order }, !poll);
        if (!result.ok) { setError(result.message); return; }
        onSaved();
      } catch { setError("We couldn’t save this poll. Please try again."); }
      finally { busy.current = false; }
    });
  }
  return <form onSubmit={submit}>
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">{poll ? "Edit poll" : "Create poll"}</legend>
      <label className="field-label">Label (optional)<input className="field-input" value={eyebrow} onChange={(event) => setEyebrow(event.target.value)} maxLength={POLL_LIMITS.eyebrow} /></label>
      <label className="field-label">Question<input className="field-input" required value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={POLL_LIMITS.question} /></label>
      <div>
        <p className="field-label mb-2">Answer options</p>
        {locked ? <p className="mb-3 text-xs leading-5 text-[#202523]/65">Voting has begun. Options and single/multiple choice are locked to protect existing answers. You can still reorder options or update the question and visibility.</p> : null}
        <ol className="space-y-3">
          {options.map((option, index) => <li className="rounded-xl border border-[#202523]/10 p-3" key={index}>
            <label className="field-label">Option {index + 1}<input className="field-input" required readOnly={locked} maxLength={POLL_LIMITS.option} value={option.text} onChange={(event) => setOptions(options.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /></label>
            <div className="mt-1 flex flex-wrap gap-1">
              <button type="button" className="min-h-11 px-3 text-xs text-[#355f9e] disabled:opacity-35" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑ Up</button>
              <button type="button" className="min-h-11 px-3 text-xs text-[#355f9e] disabled:opacity-35" aria-label={`Move option ${index + 1} down`} disabled={index === options.length - 1} onClick={() => move(index, 1)}>↓ Down</button>
              {!locked ? <button type="button" className="min-h-11 px-3 text-xs text-[#843528] disabled:opacity-35" aria-label={`Remove option ${index + 1}`} disabled={options.length <= POLL_LIMITS.minOptions} onClick={() => setOptions(options.filter((_, i) => i !== index))}>Remove</button> : null}
            </div>
          </li>)}
        </ol>
        {!locked ? <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-[#355f9e] disabled:opacity-35" disabled={options.length >= POLL_LIMITS.maxOptions} onClick={() => setOptions([...options, { key: crypto.randomUUID(), text: "" }])}>+ Add option</button> : null}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 accent-[#355f9e]" type="checkbox" checked={multiple} disabled={locked} onChange={(event) => setMultiple(event.target.checked)} />Allow multiple choices</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 accent-[#355f9e]" type="checkbox" checked={showResults} onChange={(event) => setShowResults(event.target.checked)} />Show live results after voting</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 accent-[#355f9e]" type="checkbox" checked={closedResults} onChange={(event) => setClosedResults(event.target.checked)} />Keep final results visible when closed</label>
      <label className="field-label">Display order (lower first)<input className="field-input max-w-32" type="number" min={0} max={999} required value={order} onChange={(event) => setOrder(event.target.valueAsNumber)} /></label>
      <p className="text-xs leading-5 text-[#202523]/60">{poll ? "Changes to an open poll appear immediately. Archive it to remove it from the Event Hub without losing responses." : "New polls are private drafts. Open the poll when you’re ready for guests to vote."}</p>
      {error ? <p role="alert" className="text-sm text-[#843528]">{error}</p> : null}
      <div className="flex flex-wrap gap-3"><button type="submit" className="primary-button" disabled={pending}>{pending ? "Saving…" : poll ? "Save changes" : "Save draft"}</button><button type="button" className="min-h-11 px-3 text-sm text-[#355f9e]" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}
