/* eslint-disable @next/next/no-img-element -- Authenticated private images must not pass through the public image optimizer. */
import type { EventDraftFields } from "../../lib/event-drafts";
import { draftArtworkCrop, draftImageUrl, type DraftArtwork, type DraftImageKind } from "../../lib/event-draft-artwork";
import type { ReactNode } from "react";
import { DesignedHub, DesignedInvitation } from "../event-design/event-presentation";
import { ArtworkPreviewAction } from "./artwork-preview-action";
import { artworkImageStyle } from "../../lib/design-artwork";
import { responsiveArtworkStyle } from "../../lib/responsive-artwork";
import type { DesignPreviewDevice } from "../../lib/design-preview";
import headerStyles from "../event-hub/header-artwork.module.css";

export function EventDraftPreview({ draft, artwork, view, children, actions, fullPage = false, onEditArtwork, artworkEditingDisabled = false, device }: { draft: EventDraftFields & { id: string }; artwork: DraftArtwork; view: "invitation" | "hub"; children?: ReactNode; actions?: ReactNode; fullPage?: boolean; onEditArtwork?: (kind: DraftImageKind) => void; artworkEditingDisabled?: boolean; device?: DesignPreviewDevice }) {
  const header = artwork.header.path ? artwork.header : artwork.invitation;
  const image = view === "hub" ? header : artwork.invitation;
  const kind = view === "hub" ? "header" : "invitation";
  const crop = draftArtworkCrop(artwork, kind, "phone");
  const desktopCrop = kind === "header" ? artwork.header.desktopCrop : artwork.design?.invitationDesktopCrop;
  const artworkAction = onEditArtwork ? <ArtworkPreviewAction kind={view === "hub" ? "header" : "invitation"} onSelect={onEditArtwork} disabled={artworkEditingDisabled} /> : undefined;
  const date = draft.startsAtUtc ? new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(draft.startsAtUtc)) : "Date & time to come";
  const Heading = fullPage ? "h1" : "h3";
  if (artwork.design) {
    const Presentation = view === "hub" ? DesignedHub : DesignedInvitation;
    const local = (options: Intl.DateTimeFormatOptions) => draft.startsAtUtc ? new Intl.DateTimeFormat("en-US", { ...options, timeZone: draft.timeZone }).format(new Date(draft.startsAtUtc)) : "";
    return <Presentation appearance={artwork.design} preview actions={actions} artworkAction={artworkAction}
      details={{ title: draft.title, eyebrow: draft.hostName ? `Hosted by ${draft.hostName}` : "You’re invited", date: local({ dateStyle: "full" }) || "Date & time to come", time: local({ hour: "numeric", minute: "2-digit", timeZoneName: "short" }), venue: draft.venue || "Location to come", address: draft.address, description: draft.description }}
      image={{ url: image.path ? draftImageUrl(draft.id, image.path) : "", alt: image.alt, crop, desktopCrop }}>
      {children ?? <p className="text-sm leading-6">Private preview · Configure the guest experience in RSVP &amp; Hub settings. No response can be submitted here.</p>}
    </Presentation>;
  }
  return <div className={`mx-auto w-full overflow-hidden rounded-[1.75rem] border border-[#202523]/15 bg-[#f7f0e3] shadow-[0_16px_45px_rgb(32_37_35_/_0.08)] ${fullPage ? (view === "invitation" ? "grid max-w-6xl lg:grid-cols-2" : "max-w-4xl") : "max-w-[390px]"}`}>
    <div className={`border-b border-[#202523]/10 px-5 py-4 ${fullPage ? "lg:col-span-2" : ""}`}><span className="font-serif text-xl">Shindig</span><span className="float-right mt-1 text-[0.6rem] font-bold uppercase tracking-widest text-[#355f9e]">Private preview</span></div>
    {image.path ? <div data-device={view === "hub" ? device ?? (fullPage ? undefined : "phone") : undefined} className={view === "hub" ? headerStyles.frame : `relative min-w-0 p-4 pb-0 ${fullPage ? "lg:p-6" : ""}`}>
      <img src={draftImageUrl(draft.id, image.path)} alt={image.alt} className={view === "hub" ? `${headerStyles.image} absolute h-full w-full object-cover` : "h-auto w-full rounded-2xl"} style={view === "hub" ? desktopCrop ? responsiveArtworkStyle(crop, desktopCrop) : artworkImageStyle(crop) : undefined} />
      {artworkAction}
    </div> : <div className="relative grid aspect-[16/9] place-items-center bg-[#e9f2f8] px-5 text-center text-sm text-[#355f9e]">Your artwork will appear here{artworkAction}</div>}
    <div className={`min-w-0 space-y-4 p-5 ${fullPage ? "sm:p-8" : ""}`}>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">{view === "hub" ? "Event Hub" : "You’re invited"}</p>
      <Heading className={`break-words font-serif text-3xl leading-tight tracking-[-0.025em] ${fullPage ? "sm:text-5xl" : ""}`}>{draft.title}</Heading>
      {draft.hostName && <p className="break-words text-sm text-[#202523]/65">Hosted by {draft.hostName}</p>}
      <div className="space-y-2 border-y border-[#202523]/12 py-4 text-sm leading-6"><p>{date}</p><p className="break-words">{[draft.venue, draft.address, draft.cityLabel].filter(Boolean).join(" · ") || "Location to come"}</p></div>
      {draft.description && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#202523]/65">{draft.description}</p>}
      {children ?? <p className="rounded-xl border border-dashed border-[#355f9e]/25 p-4 text-xs leading-5 text-[#202523]/60">Configure the guest experience in RSVP &amp; Hub settings. This artwork preview cannot receive guest responses.</p>}
    </div>
  </div>;
}
