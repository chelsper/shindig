import Link from "next/link";
import type { EventDraft } from "../../lib/event-drafts";
import type { DraftArtwork } from "../../lib/event-draft-artwork";
import type { DraftSettingsRecord } from "../../lib/event-draft-settings";
import { draftEventSlug, eventPaths } from "../../lib/event-routes";
import { EventDraftPreview } from "./event-draft-preview";
import { DraftHubPreview, DraftRsvpPreview } from "./event-draft-experience-preview";
import { EventSetupNavigation } from "./event-setup-navigation";

const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#202523]/20 px-4 py-2 text-xs font-semibold text-[#355f9e]";

export function EventDraftFullPreview({ draft, artwork, record, view }: {
  draft: EventDraft; artwork: DraftArtwork; record: DraftSettingsRecord; view: "invitation" | "hub";
}) {
  const id = draft.id;
  const base = `/admin/events/${id}`;
  const paths = eventPaths(draftEventSlug(id));
  const actions = <div className="flex flex-wrap gap-2" aria-label="Event actions preview"><button className={`${button} opacity-50`} type="button" disabled>Add to Calendar</button><button className={`${button} opacity-50`} type="button" disabled>Get Directions</button></div>;

  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-6xl">
      <header className="mb-6 rounded-2xl border border-[#355f9e]/20 bg-[#e9f2f8] p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#355f9e]">Host-only draft preview · Not published automatically</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#202523]/70">Your saved event, at full size. Switch between the invitation and Hub to review the experience. Responses and other guest actions are disabled here.</p>
        {record.revision === 0 && <p className="mt-2 text-sm text-[#765319]">RSVP &amp; Hub choices are still suggested defaults. Save them in settings before your final review.</p>}
        <EventSetupNavigation id={id} current="preview" />
        <nav aria-label="Preview screens" className="mt-4 flex flex-wrap gap-2">
          <Link className={`${button} ${view === "invitation" ? "bg-white" : ""}`} aria-current={view === "invitation" ? "page" : undefined} href={`${base}/preview`}>Invitation</Link>
          <Link className={`${button} ${view === "hub" ? "bg-white" : ""}`} aria-current={view === "hub" ? "page" : undefined} href={`${base}/preview?view=hub`}>Event Hub</Link>
          <Link className={button} href="/admin/events">All events</Link>
        </nav>
      </header>
      <EventDraftPreview draft={draft} artwork={artwork} view={view} fullPage actions={view === "hub" && artwork.design ? actions : undefined}>
        {view === "invitation" ? <>
          <DraftRsvpPreview settings={record.settings} timeZone={draft.timeZone} />
          <Link className={`${button} w-full`} href={`${base}/preview?view=hub`}>View Event Hub preview →</Link>
        </> : <>
          {!artwork.design && actions}
          <DraftHubPreview settings={record.settings} />
          <Link className={`${button} w-full`} href={`${base}/preview`}>Return to invitation preview</Link>
        </>}
      </EventDraftPreview>
      <footer className="mx-auto mt-6 max-w-4xl rounded-2xl border border-[#202523]/10 p-4 text-xs leading-5 text-[#202523]/60">
        <p className="font-semibold">Stable event routes · Check publication before sharing</p>
        <p className="mt-1">These stable paths are reserved for this event. They show only the last explicitly published version, or an unavailable page if not published. This draft preview always requires your host session.</p>
        <p className="mt-2 break-all">Invitation: {paths.invitation}</p><p className="break-all">Hub: {paths.hub}</p>
      </footer>
    </div>
  </main>;
}
