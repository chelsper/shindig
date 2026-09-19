"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { voteInPoll } from "../../app/event/interaction-actions";
import type { PublicPoll } from "../../lib/polls";
import { useGuestInteractions } from "../guest-interactions-provider";
import { PollResults } from "./poll-results";

export function GuestPoll({ poll }: { poll: PublicPoll }) {
  const guest = useGuestInteractions();
  const saved = guest.polls[poll.key];
  const [draft, setDraft] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const selected = draft ?? saved?.selected ?? [];
  const closed = poll.status === "CLOSED";
  const results = closed ? poll.results : (poll.showResults && saved?.selected.length ? saved.results : null);
  const showForm = !closed && (!saved?.selected.length || editing);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !guest.ready || !selected.length || closed) return;
    busy.current = true;
    setError(null); setMessage(null);
    startTransition(async () => {
      try {
        const result = await voteInPoll(poll.key, selected);
        if (!result.ok) { setError(result.message); return; }
        guest.recordPoll(poll.key, result.data);
        setDraft(null); setEditing(false);
        setMessage("Your contribution to important research is recorded.");
      } catch { setError("Your answer didn’t save. Please try again."); }
      finally { busy.current = false; }
    });
  }
  function choose(key: string) {
    setDraft(poll.allowMultiple ? (selected.includes(key) ? selected.filter((value) => value !== key) : [...selected, key]) : [key]);
  }
  return <div>
    <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">{poll.eyebrow || "Important research"}{closed ? " · Final results" : ""}</p>
    <h3 className="mt-2 break-words font-serif text-2xl leading-tight sm:text-3xl">{poll.question}</h3>
    {showForm ? <form className="mt-4" onSubmit={submit}>
      <fieldset disabled={pending || !guest.ready} className="space-y-2">
        <legend className="mb-3 text-xs text-[#202523]/60">{poll.allowMultiple ? "Choose all that apply." : "Pick one. This is very serious science."}</legend>
        {poll.options.map((option) => <label key={option.key} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${selected.includes(option.key) ? "border-[#355f9e]/35 bg-[#e9f2f8]/80" : "border-[#202523]/10 bg-[#fffaf1]/65"}`}>
          <input type={poll.allowMultiple ? "checkbox" : "radio"} name={`poll-${poll.key}`} value={option.key} checked={selected.includes(option.key)} onChange={() => choose(option.key)} className="size-4 shrink-0 accent-[#355f9e]" />
          <span className="min-w-0 break-words">{option.text}</span>
        </label>)}
        <div className="flex flex-wrap gap-2 pt-2"><button className="primary-button" type="submit" disabled={pending || !guest.ready || !selected.length}>{pending ? "Saving…" : saved?.selected.length ? "Update vote" : "Vote"}</button>
          {editing ? <button type="button" className="min-h-11 px-3 text-sm text-[#355f9e]" onClick={() => { setEditing(false); setDraft(null); }}>Cancel</button> : null}
        </div>
      </fieldset>
    </form> : null}
    {message ? <p className="mt-4 text-sm leading-6 text-[#285630]" role="status">{message}</p> : null}
    {error || (!guest.ready && guest.error && !closed) ? <p className="mt-3 text-sm text-[#843528]" role="alert">{error || guest.error}</p> : null}
    {!showForm && results ? <PollResults options={poll.options} results={results} multiple={poll.allowMultiple} selected={saved?.selected} /> : null}
    {!showForm && saved?.selected.length && !results && !closed ? <p className="mt-4 text-sm leading-6 text-[#202523]/65">Your choice: {poll.options.filter((option) => saved.selected.includes(option.key)).map((option) => option.text).join(", ")}. Results are staying with the host for now.</p> : null}
    {!closed && !showForm ? <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-[#355f9e] underline underline-offset-4" disabled={pending || !guest.ready} onClick={() => { setEditing(true); setMessage(null); }}>Change my answer</button> : null}
    {closed ? <p className="mt-4 text-xs text-[#202523]/60">This poll is closed. Thanks for weighing in.</p> : null}
    {!closed ? <p className="mt-4 text-[0.68rem] leading-5 text-[#202523]/50">Your choice is remembered on this browser. No names, accounts, or logins.</p> : null}
  </div>;
}

export function PollsModule({ polls }: { polls: PublicPoll[] }) {
  const [page, setPage] = useState(0);
  if (!polls.length) return null;
  const index = Math.min(page, polls.length - 1);
  return <section aria-label="Important research" className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
    <h2 className="sr-only">Event polls</h2>
    {polls.length > 1 ? <nav aria-label="Poll questions" className="mb-5 flex items-center justify-between gap-2 border-b border-[#202523]/10 pb-3 text-sm">
      <button type="button" className="min-h-11 px-2 text-[#355f9e] disabled:opacity-35" disabled={index === 0} onClick={() => setPage(index - 1)}>← Previous</button>
      <span className="text-xs text-[#202523]/60">{index + 1} of {polls.length}</span>
      <button type="button" className="min-h-11 px-2 text-[#355f9e] disabled:opacity-35" disabled={index === polls.length - 1} onClick={() => setPage(index + 1)}>Next →</button>
    </nav> : null}
    <GuestPoll poll={polls[index]} key={polls[index].key} />
  </section>;
}
