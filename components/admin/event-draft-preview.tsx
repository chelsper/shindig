/* eslint-disable @next/next/no-img-element -- Authenticated private images must not pass through the public image optimizer. */
import type { EventDraft } from "../../lib/event-drafts";
import { draftImageUrl, type DraftArtwork } from "../../lib/event-draft-artwork";

export function EventDraftPreview({ draft, artwork, view }: { draft: EventDraft; artwork: DraftArtwork; view: "invitation" | "hub" }) {
  const header = artwork.header.path ? artwork.header : artwork.invitation;
  const image = view === "hub" ? header : artwork.invitation;
  const date = draft.startsAtUtc ? new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(draft.startsAtUtc)) : "Date & time to come";
  return <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[1.75rem] border border-[#202523]/15 bg-[#f7f0e3] shadow-[0_16px_45px_rgb(32_37_35_/_0.08)]">
    <div className="border-b border-[#202523]/10 px-5 py-4"><span className="font-serif text-xl">Shindig</span><span className="float-right mt-1 text-[0.6rem] font-bold uppercase tracking-widest text-[#355f9e]">Private preview</span></div>
    {image.path ? <div className={view === "hub" ? "relative aspect-[16/9] overflow-hidden bg-[#dceaf7]" : "p-4 pb-0"}>
      <img src={draftImageUrl(draft.id, image.path)} alt={image.alt} className={view === "hub" ? "absolute h-full w-full object-cover" : "h-auto w-full rounded-2xl"} style={view === "hub" ? { objectPosition: `${artwork.header.focalX}% ${artwork.header.focalY}%`, transform: `scale(${artwork.header.zoomPercent / 100})`, transformOrigin: `${artwork.header.focalX}% ${artwork.header.focalY}%` } : undefined} />
    </div> : <div className="grid aspect-[16/9] place-items-center bg-[#e9f2f8] px-5 text-center text-sm text-[#355f9e]">Your artwork will appear here</div>}
    <div className="space-y-4 p-5">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">{view === "hub" ? "Event Hub" : "You’re invited"}</p>
      <h3 className="break-words font-serif text-3xl leading-tight tracking-[-0.025em]">{draft.title}</h3>
      {draft.hostName && <p className="break-words text-sm text-[#202523]/65">Hosted by {draft.hostName}</p>}
      <div className="space-y-2 border-y border-[#202523]/12 py-4 text-sm leading-6"><p>{date}</p><p className="break-words">{[draft.venue, draft.address, draft.cityLabel].filter(Boolean).join(" · ") || "Location to come"}</p></div>
      {draft.description && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#202523]/65">{draft.description}</p>}
      <p className="rounded-xl border border-dashed border-[#355f9e]/25 p-4 text-xs leading-5 text-[#202523]/60">{view === "hub" ? "Event features will be configured in a later step." : "The RSVP experience will be configured in a later step."} This preview cannot receive guest responses.</p>
    </div>
  </div>;
}
