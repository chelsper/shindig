"use client";
import { useRef, useState, useTransition } from "react";
import { setHostPollStatus } from "../../app/admin/polls/actions";
import type { AdminPoll } from "../../lib/polls";
import { PollResults } from "../event-hub/poll-results";
import { PollEditor } from "./poll-editor";

function HostPollCard({ poll }: { poll: AdminPoll }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  function change(status: "OPEN" | "CLOSED" | "ARCHIVED" | "DELETE_DRAFT") {
    if (busy.current) return;
    busy.current = true; setError(null); setNotice(null);
    startTransition(async () => {
      try {
        const result = await setHostPollStatus(poll.key, status, status === "DELETE_DRAFT" && confirmDelete);
        if (!result.ok) { setError(result.message); return; }
        setNotice(status === "OPEN" ? "Poll is open." : status === "CLOSED" ? "Poll is closed." : "Poll archived; all responses preserved.");
      } catch { setError("We couldn’t update this poll. Please try again."); }
      finally { busy.current = false; }
    });
  }
  const button = "min-h-11 rounded-full border border-[#355f9e]/25 px-4 text-xs font-semibold text-[#355f9e] disabled:opacity-40";
  return <li className="rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/85 p-5 sm:p-6">
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#355f9e]">{poll.status} · {poll.allowMultiple ? "Multiple choice" : "Single choice"}</p>
    {editing ? <PollEditor poll={poll} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setNotice("Poll saved."); }} /> : <>
      {poll.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#202523]/55">{poll.eyebrow}</p> : null}
      <h2 className="mt-1 break-words font-serif text-2xl">{poll.question}</h2>
      <PollResults options={poll.options} results={poll.results} multiple={poll.allowMultiple} admin />
      <p className="mt-2 text-xs leading-5 text-[#202523]/55">Live results {poll.showResults ? "shown after voting" : "hidden"} · Closed results {poll.showClosedResults ? "visible" : "hidden"}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={pending} onClick={() => { setEditing(true); setNotice(null); }}>Edit</button>
        {poll.status !== "OPEN" ? <button type="button" className={button} disabled={pending} onClick={() => change("OPEN")}>{poll.status === "DRAFT" ? "Open poll" : "Reopen poll"}</button> : <button type="button" className={button} disabled={pending} onClick={() => change("CLOSED")}>Close poll</button>}
        {poll.status !== "ARCHIVED" && poll.status !== "DRAFT" ? <button type="button" className={button} disabled={pending} onClick={() => change("ARCHIVED")}>Archive</button> : null}
        {poll.status === "DRAFT" ? <button type="button" className={button} disabled={pending} onClick={() => setConfirmDelete(!confirmDelete)}>Delete draft</button> : null}
      </div>
      {confirmDelete ? <div className="mt-3 rounded-xl border border-[#843528]/20 p-3 text-sm"><p>Delete this private draft and its options? This can’t be undone.</p><div className="mt-2 flex gap-3"><button type="button" disabled={pending} className="min-h-11 text-[#843528] underline" onClick={() => change("DELETE_DRAFT")}>Confirm delete</button><button type="button" disabled={pending} className="min-h-11 text-[#355f9e]" onClick={() => setConfirmDelete(false)}>Cancel</button></div></div> : null}
    </>}
    {notice ? <p role="status" className="mt-3 text-sm text-[#285630]">{notice}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-[#843528]">{error}</p> : null}
  </li>;
}

export function HostPollsManager({ polls }: { polls: AdminPoll[] }) {
  const [creating, setCreating] = useState(false);
  return <div className="space-y-5">
    {creating ? <section aria-label="Create a poll" className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7"><h2 className="mb-5 font-serif text-2xl">A new question</h2><PollEditor onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} /></section> : <button type="button" className="primary-button" onClick={() => setCreating(true)}>+ Create poll</button>}
    {polls.length ? <ul aria-label="Host polls" className="space-y-4">{polls.map((poll) => <HostPollCard poll={poll} key={poll.key} />)}</ul> : <p className="py-5 text-center text-sm leading-6 text-[#202523]/65">No polls yet. Create a draft; guests won’t see it until you open it.</p>}
  </div>;
}
