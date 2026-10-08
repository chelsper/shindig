"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { duplicateEvent } from "../../app/admin/events/duplicate/actions";
import { DRAFT_LIMITS } from "../../lib/event-drafts";
import { duplicateEventPath, suggestedDuplicateTitle } from "../../lib/event-duplication";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { ContentShell } from "./content-shell";

export function EventDuplicateForm({ source, sourceTitle, requestId, fingerprint, hasArtwork, settingsSaved }: {
  source: string; sourceTitle: string; requestId: string; fingerprint: string; hasArtwork: boolean; settingsSaved: boolean;
}) {
  const [title, setTitle] = useState(suggestedDuplicateTitle(sourceTitle)), [confirmed, setConfirmed] = useState(false);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null), [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null), [pending, startTransition] = useTransition();
  const busy = useRef(false), router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const legacy = source === OYSTER_ROAST_EVENT.slug;
  return <div onClickCapture={(event) => { if (busy.current && event.target instanceof Element && event.target.closest("a")) event.preventDefault(); }}>
    <ContentShell title="Another gathering, same good start" contextLabel="Duplicate event" dashboardHref="/admin/events" description="Keep the setup you like. Give the next gathering a fresh guest list and its own invitation.">
      <form className="space-y-6 pb-10" onSubmit={(event) => {
        event.preventDefault(); if (busy.current || copiedId || !confirmed) return;
        const name = submittedTitle ?? title.trim();
        busy.current = true; setSubmittedTitle(name); setError("");
        startTransition(async () => {
          try {
            const result = await duplicateEvent({ source, requestId, fingerprint, title: name, confirmed: true });
            if (!result.ok) { setError(result.message); return; }
            setCopiedId(result.id); router.replace(`/admin/events/${result.id}/setup?copied=1`);
          } catch { setError("We couldn’t confirm the copy. Retry here to check or finish the same copy; your original event hasn’t changed."); }
          finally { busy.current = false; }
        });
      }}>
        <section className="rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/65 p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">Copying from</p><h2 className="mt-2 break-words font-serif text-3xl">{sourceTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-[#202523]/70">{legacy ? "The current Oyster Roast setup. Jasper Shucks stays exactly as it is." : "The latest saved setup, including any unpublished edits. The source event and its live pages stay unchanged."}</p>
        </section>
        <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7">
          <label className="field-label">New event name<input className="field-input" name="title" value={title} maxLength={DRAFT_LIMITS.title} required disabled={pending || submittedTitle !== null || Boolean(copiedId)} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="mt-6 space-y-5 text-sm leading-6">
            <div><h2 className="font-semibold">Bring along</h2><p className="mt-1 text-[#202523]/65">Description, host and location details, timezone, and RSVP &amp; Hub choices. {hasArtwork ? "Independent copies of the invitation artwork and Hub header, including crop settings." : "This event has no artwork to copy; you can add it later."}</p></div>
            <div><h2 className="font-semibold">Start fresh</h2><p className="mt-1 text-[#202523]/65">Dates are cleared. No guests, responses, edit tokens, songs, questions, answers, host updates, polls or votes carry over. The new event gets its own identity and link, available only after you review and publish it.</p></div>
            {!settingsSaved && <p className="text-[#765319]">The source RSVP choices are still unsaved defaults. Review and save them in the new draft.</p>}
            <p className="rounded-2xl bg-[#fff4d8] p-4 text-[#765319]">Artwork and descriptions may still mention old dates or event names. Check them before publishing. Weather location confirmation also starts fresh.</p>
            {legacy && <p className="text-xs text-[#202523]/60">The copy uses Shindig’s standard invitation labels and RSVP wording. Oyster Roast-specific labels aren’t carried into the new event.</p>}
          </div>
        </section>
        <label className="flex min-h-12 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={confirmed} disabled={pending || submittedTitle !== null || Boolean(copiedId)} onChange={(event) => setConfirmed(event.target.checked)} /><span>Create a new private draft. Leave the original event unchanged.</span></label>
        {error && <p role="alert" className="rounded-2xl bg-[#fff4d8] p-4 text-sm leading-6 text-[#765319]">{error}</p>}
        {copiedId ? <p role="status" className="rounded-2xl bg-[#e4eee1] p-4 text-sm leading-6 text-[#285630]">Your new private draft is ready. <Link className="underline underline-offset-4" href={`/admin/events/${copiedId}/setup?copied=1`}>Open the new draft →</Link></p> : <button className="primary-button w-full" type="submit" disabled={pending || !confirmed || !title.trim()}>{pending ? "Copying event…" : submittedTitle !== null ? "Retry the same copy" : "Create private copy"}</button>}
        <p className="text-center text-xs leading-5 text-[#202523]/60">Nothing is published and no invitations are sent.</p>
        <div className="flex flex-wrap gap-x-6 text-sm text-[#355f9e]"><Link className="inline-flex min-h-11 items-center underline underline-offset-4" href={legacy ? "/admin/events" : `/admin/events/${source}/setup`}>Back to source event</Link>{submittedTitle !== null && !pending && !copiedId && <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={duplicateEventPath(source)}>Review a fresh copy request</a>}</div>
        {submittedTitle !== null && !copiedId && <p className="text-xs leading-5 text-[#202523]/60">The name is locked for safe retries. Before starting a separate request, check Your events in case the first copy completed.</p>}
      </form>
    </ContentShell>
  </div>;
}
