"use client";
import { useRef, useState } from "react";
import { refreshDuplicateReview, reviewDuplicateRsvp } from "../../app/admin/guests/duplicates/actions";
import { duplicatePairKey, type DuplicatePair, type DuplicateReview, type DuplicateResponse } from "../../lib/rsvp-duplicates";

function ResponseCard({ response, latest, timeZone }: { response: DuplicateResponse; latest: boolean; timeZone: string }) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });
  return <div className={`min-w-0 rounded-2xl border p-4 ${latest ? "border-[#355f9e]/30 bg-[#e9f2f8]/60" : "border-[#202523]/10 bg-white/40"}`}>
    <p className="text-xs font-semibold text-[#355f9e]">{latest ? "Latest response · keep" : "Older response · remove"}</p>
    <h3 className="mt-2 break-words font-serif text-2xl">{response.guestName}</h3>
    <p className="mt-2 text-sm font-semibold">{response.attending ? `Attending · Party of ${response.partySize}` : "Can’t Make It"}</p>
    <p className="mt-1 text-xs text-[#202523]/65">{response.attending && response.displayOnGuestList ? "Name shared on guest list" : "Name hidden on guest list"}</p>
    {response.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{response.comment}</p>}
    <dl className="mt-3 space-y-2 text-xs leading-5 text-[#202523]/65"><div><dt>Submitted</dt><dd>{format.format(new Date(response.createdAt))}</dd></div><div><dt>Last updated</dt><dd>{format.format(new Date(response.updatedAt))}</dd></div></dl>
  </div>;
}
export function DuplicateRsvpPanel({ initial, timeZone, slug, guestsHref }: { initial: DuplicateReview; timeZone: string; slug?: string; guestsHref: string }) {
  const [review, setReview] = useState(initial), [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const busy = useRef(false);
  async function run(pair?: DuplicatePair, action?: "merge" | "separate") {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    try {
      const result = pair && action ? await reviewDuplicateRsvp({ action, olderId: pair.older.id, latestId: pair.latest.id,
        olderVersion: pair.older.version, latestVersion: pair.latest.version, confirmed: action === "merge" && confirming === duplicatePairKey(pair.older.id, pair.latest.id) }, slug) : await refreshDuplicateReview(slug);
      if (!result.ok) { setError(result.message); return; }
      setReview(result.data); setConfirming(null); setMessage(result.message ?? "Review refreshed.");
    } catch { setError("The review couldn’t be saved. Refresh before retrying."); }
    finally { busy.current = false; setPending(false); }
  }
  return <section aria-label="Possible duplicate RSVP review" aria-busy={pending} className="min-w-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{review.total} possible {review.total === 1 ? "match" : "matches"} · Host review only</p><button type="button" className="min-h-11 text-sm font-semibold text-[#355f9e] underline" disabled={pending} onClick={() => run()}>Refresh review</button></div>
    {message && <p role="status" className="mb-4 rounded-xl bg-[#e4eee1] p-4 text-sm text-[#285630]">{message} <a href={guestsHref} className="underline">View guest responses</a></p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#fff4d8] p-4 text-sm">{error}</p>}
    {!review.pairs.length ? <div className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-6"><h2 className="font-serif text-2xl">No possible duplicates to review.</h2><p className="mt-2 text-sm leading-6 text-[#202523]/65">Matching is a helpful hint, not proof of identity. You can still review and edit individual guest responses.</p></div> : <ul className="space-y-6">{review.pairs.map(pair => {
      const key = duplicatePairKey(pair.older.id, pair.latest.id), confirm = confirming === key;
      return <li key={key} className="min-w-0 rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-6">
        <h2 className="font-serif text-2xl">Are these the same guest or household?</h2><p className="mt-1 text-xs text-[#202523]/65">{pair.reason}. Nothing changes until you confirm.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><ResponseCard response={pair.older} latest={false} timeZone={timeZone} /><ResponseCard response={pair.latest} latest timeZone={timeZone} /></div>
        {confirm && <div className="mt-4 rounded-xl border border-[#355f9e]/20 bg-[#e9f2f8]/50 p-4 text-sm leading-6">
          <p className="font-semibold">Keep {pair.latest.guestName}’s latest {pair.latest.attending ? `Attending response (party of ${pair.latest.partySize})` : "Can’t Make It response"}?</p>
          <p className="mt-2">This permanently removes the older RSVP and its comment from the guest records. Its update link stops working; any link for the kept response stays valid.</p>
          <p className="mt-2">We never copy older contact opt-ins forward. If contact preferences changed more recently on the older response, the kept response’s opt-ins are cleared so the guest can choose again. A single invitation-tracker link moves to the kept response.</p>
        </div>}
        <div className="mt-4 flex flex-wrap gap-3">
          {confirm ? <><button type="button" disabled={pending} className="primary-button w-full px-5 sm:w-auto" onClick={() => run(pair, "merge")}>{pending ? "Saving…" : "Confirm merge · use latest response"}</button><button type="button" disabled={pending} className="min-h-11 px-3 text-sm underline" onClick={() => setConfirming(null)}>Cancel</button></> : <><button type="button" disabled={pending} className="min-h-11 rounded-full border border-[#355f9e]/30 px-5 text-sm font-semibold text-[#355f9e]" onClick={() => setConfirming(key)}>Merge and use latest response</button><button type="button" disabled={pending} className="min-h-11 px-3 text-sm underline" onClick={() => run(pair, "separate")}>Keep separate</button></>}
        </div>
      </li>;
    })}</ul>}
    {review.total > review.pairs.length && <p className="mt-4 text-sm">Showing the first {review.pairs.length} matches. More appear as you review these.</p>}
  </section>;
}
