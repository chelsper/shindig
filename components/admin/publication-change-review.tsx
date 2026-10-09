"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ChangeValue, PublicationChangeReview as ChangeReview } from "../../lib/event-publication-changes";
import type { EventVisibility } from "../../lib/event-lifecycle";

function ComparedValue({ label, value, next }: { label: string; value: ChangeValue; next?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`min-w-0 rounded-2xl border p-4 ${next ? "border-[#355f9e]/20 bg-[#e9f2f8]/60" : "border-[#202523]/10 bg-white/45"}`}>
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#202523]/65">{label}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{value.text}</p>
    {value.image && (failed ? <p className="mt-2 text-xs leading-5">Image preview unavailable. Check Artwork &amp; design before publishing.</p> : <div className="relative mt-3 h-40 w-full"><Image className="rounded-lg object-contain" src={value.image.src} alt={value.image.alt} fill sizes="(max-width: 639px) 100vw, 360px" unoptimized onError={() => setFailed(true)} /></div>)}
  </div>;
}

export function PublicationChangeReview({ id, review, visibility, savedAgain = false }: { id: string; review: ChangeReview | null; visibility: EventVisibility | null; savedAgain?: boolean }) {
  const base = `/admin/events/${id}`;
  const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
  const first = visibility === null;
  return <section id="publication-changes" aria-labelledby="publication-changes-heading" className="scroll-mt-6 rounded-3xl border border-[#355f9e]/20 bg-[#fffaf1] p-5 sm:p-7">
    <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">Before you publish</p>
    <h2 id="publication-changes-heading" className="mt-2 font-serif text-3xl">{first ? "Your first invitation" : !review ? "Comparison unavailable" : review.changeCount ? "Review your changes" : "No content changes"}</h2>
    <p className="mt-3 text-sm leading-6 text-[#202523]/75">{first ? "This event has not been published. Review the saved details below; publishing makes them available to anyone with the link." : !review ? "Reload this page to compare the saved draft with its last published version before publishing." : review.changeCount ? `${review.changeCount} ${review.changeCount === 1 ? "change" : "changes"} from the last published version. ${visibility === "published" ? "Guests still see the live version until you publish." : visibility === "archived" ? "This event is archived. Restore it privately before publishing again." : "This event is private again. Republishing makes the saved version public."}` : `The saved details, artwork and settings match the last published version. ${visibility === "unpublished" ? "Republishing makes this version public again." : visibility === "archived" ? "The event remains archived until you restore it." : savedAgain ? "The draft was saved again, but the values are unchanged." : "Your live event is up to date."}`}</p>
    {!first && review && review.groups.map((group) => <details key={group.id} open className="mt-5 border-t border-[#202523]/10 pt-4">
      <summary className="min-h-11 cursor-pointer content-center text-base font-semibold">{group.title} <span className="ml-1 text-xs font-normal text-[#202523]/60">({group.changes.length})</span></summary>
      <div className="mt-3 space-y-5">{group.changes.map((change) => <div key={change.id}>
        <h3 className="mb-2 text-sm font-semibold">{change.label}</h3>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <ComparedValue key={`before-${change.before.image?.src ?? ""}`} label={visibility === "published" ? "Live now" : "Last published"} value={change.before} />
          <ComparedValue key={`after-${change.after.image?.src ?? ""}`} label={visibility === "archived" ? "Saved draft" : "After publishing"} value={change.after} next />
        </div>
        {change.note && <p className="mt-2 text-xs leading-5 text-[#202523]/65">{change.note}</p>}
        {change.editHref && <Link className={link} href={change.editHref}>Review {change.label.toLowerCase()} →</Link>}
      </div>)}</div>
      <Link className={`${link} mt-2`} href={group.editHref}>Edit {group.title} →</Link>
    </details>)}
    {review?.calendarChanged && <p className="mt-5 rounded-2xl bg-[#fff4d8] p-4 text-sm leading-6">Calendar details are changing. Previously downloaded calendar files won’t update automatically; guests may need to add the revised event.</p>}
    <div className="mt-4 flex flex-wrap gap-x-5">
      <Link className={link} href={`${base}/preview`}>Preview saved invitation →</Link>
      <Link className={link} href={`${base}/preview?view=hub`}>Preview saved Event Hub →</Link>
    </div>
    <p className="mt-3 text-xs leading-5 text-[#202523]/60">Saved event setup only—not guest responses, songs, questions or host posts. No notifications are sent. {visibility === "archived" ? "Restoring and publishing remain separate steps." : "Publishing below is still a separate confirmation."}</p>
  </section>;
}
