"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { deleteEvent, finishArtworkCleanup } from "../../app/admin/events/[id]/privacy/actions";
import type { DeletionReceipt, DeletionReview } from "../../lib/event-deletion";

const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";
export function EventDeletionControls({ review, initialReceipt }: { review: DeletionReview | null; initialReceipt: DeletionReceipt | null }) {
  const [saved, setSaved] = useState(initialReceipt), [phrase, setPhrase] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submitting = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || (!saved && (!review || phrase !== "DELETE" || !confirmed))) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const result = saved ? await finishArtworkCleanup(saved.id) : await deleteEvent({ ...review, phrase, confirmed });
      if (result.ok) { setSaved(result.receipt); setPhrase(""); setConfirmed(false); }
      else setError(result.message);
    } catch { setError("We couldn’t confirm the change. Refresh to check its current status, then try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (saved) return <section className="rounded-3xl border border-[#355f9e]/20 bg-[#fffaf1] p-5 sm:p-7" aria-labelledby="deletion-result-heading">
    <div role="status"><h2 id="deletion-result-heading" className="font-serif text-3xl">Event records deleted.</h2>
      <p className="mt-3 text-sm leading-7">The invitation, Event Hub, and private edit links no longer work. The event’s active database records and guest information have been permanently removed.</p>
      <p className="mt-3 text-sm leading-7">{saved.artworkCleanedAt ? "Uploaded artwork cleanup is complete." : "Uploaded artwork cleanup is still pending. We wait at least three minutes after deletion so any in-progress uploads can finish, then remove files from this event’s private folder. This does not happen automatically—return here to finish cleanup."}</p>
    </div>
    {!saved.artworkCleanedAt && <form onSubmit={submit} className="mt-4" aria-busy={busy}>
      <button disabled={busy} className="primary-button min-h-12 px-5 text-sm disabled:opacity-50">{busy ? "Checking artwork…" : "Check & finish artwork cleanup"}</button>
      {!saved.cleanupReady && <p className="mt-2 text-xs leading-6 text-[#202523]/70">Still in the three-minute settling period. Check again shortly.</p>}
    </form>}
    {error && <p role="alert" className="mt-4 text-sm leading-6 text-[#8b392e]">{error}</p>}
    <p className="mt-4 text-xs leading-6 text-[#202523]/70">A minimal deletion receipt and reserved event link remain. Provider backups, security logs, and copies others saved outside Shindig are not erased by this action.</p>
    <div className="mt-4 flex flex-wrap gap-x-5"><Link href="/admin/events" className={link}>Your events →</Link><Link href="/host/account" className={link}>Account &amp; Privacy →</Link><Link href="/support" className={link}>Get help</Link></div>
  </section>;
  if (!review) return null;
  return <section className="rounded-3xl border border-[#a34d3b]/25 bg-[#fffaf1] p-5 sm:p-7" aria-labelledby="delete-heading">
    <h2 id="delete-heading" className="font-serif text-3xl">Permanently delete this event</h2>
    <p className="mt-3 break-words text-base font-semibold">{review.title}</p>
    <p id="delete-warning" className="mt-3 text-sm leading-7">This cannot be undone in Shindig. It removes the draft, published pages, RSVPs, optional contact details, private invitation tracker, questions, updates, playlist, votes, applause, and bring-something signups for this event. Uploaded artwork has a separate cleanup step.</p>
    <p className="mt-3 text-sm leading-7">{review.visibility === "published" ? "This event is live. Its guest links will stop working immediately." : "Any previously shared guest links will stop working."} Existing copies made with Duplicate Event are separate events and will not be deleted. The old event link stays reserved and cannot be reused.</p>
    <form onSubmit={submit} className="mt-6 space-y-4" aria-describedby="delete-warning" aria-busy={busy}>
      <label className="flex min-h-12 items-start gap-3 text-sm leading-6"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[#8b392e]" />I understand this permanently removes this event’s records, and I have saved any exports I need.</label>
      <label className="block text-sm font-semibold">Type DELETE to confirm<input value={phrase} onChange={e => setPhrase(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} required pattern="DELETE" maxLength={6} className="mt-2 block min-h-12 w-full rounded-xl border border-[#202523]/25 bg-white px-4 font-mono text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b392e]" /></label>
      {error && <p role="alert" className="text-sm leading-6 text-[#8b392e]">{error}</p>}
      <div className="flex flex-wrap items-center gap-4"><button disabled={busy || !confirmed || phrase !== "DELETE"} className="inline-flex min-h-12 items-center rounded-full bg-[#8b392e] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8b392e]">{busy ? "Deleting event…" : "Permanently delete event"}</button><Link href={`/admin/events/${review.id}/setup`} className={link}>Keep my event</Link></div>
    </form>
  </section>;
}
