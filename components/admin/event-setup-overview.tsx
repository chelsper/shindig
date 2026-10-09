import Link from "next/link";
import type { EventDraft } from "../../lib/event-drafts";
import type { DraftArtworkRecord } from "../../lib/event-draft-artwork";
import { DRAFT_HUB_MODULES, type DraftSettingsRecord } from "../../lib/event-draft-settings";
import type { Coordinates } from "../../lib/event-publication";
import { publicationIssues } from "../../lib/event-readiness";
import { eventStatus, type EventLifecycle } from "../../lib/event-lifecycle";
import { EventSetupNavigation } from "./event-setup-navigation";
import { duplicateEventPath } from "../../lib/event-duplication";

export type SetupPublication = EventLifecycle & { hasUnpublishedChanges: boolean };
export function EventSetupOverview({ draft, artwork, settings, coordinates, live, justSaved = false, justCopied = false }: {
  draft: EventDraft; artwork: DraftArtworkRecord; settings: DraftSettingsRecord;
  coordinates: Coordinates | null; live: SetupPublication | null; justSaved?: boolean; justCopied?: boolean;
}) {
  const base = `/admin/events/${draft.id}`;
  const issues = publicationIssues({ details: draft, artwork: artwork.settings, settings: settings.settings, coordinates });
  const missing = [
    ...issues.map((issue) => ({ message: issue.message, href: `${base}${issue.destination}` })),
    ...(!settings.revision ? [{ message: "Save your RSVP & Hub choices.", href: `${base}/settings` }] : []),
  ];
  const archived = live?.visibility === "archived", published = live?.visibility === "published";
  const detailsReady = !issues.some(({ id }) => id !== "weather" && id !== "deadline");
  const rsvpReady = settings.revision > 0 && !issues.some(({ id }) => id === "deadline");
  const hasArtwork = Boolean(artwork.settings.invitation.path || artwork.settings.header.path);
  const modules = DRAFT_HUB_MODULES.filter(({ id }) => settings.settings.features[id]).map(({ label }) => label);
  const steps = [
    { title: "Details", status: detailsReady ? "Ready" : "Needs attention", description: "The name, dates, location and little details that make it yours.", href: base, action: "Edit details" },
    ...(settings.settings.features.weather ? [{ title: "Location", status: coordinates ? "Ready" : "Needs attention", description: coordinates ? "Your weather location is confirmed and saved with this draft." : "Find the saved address and confirm its match, or enter verified coordinates. Changing the address requires confirmation again.", href: `${base}/location`, action: coordinates ? "Review location" : "Confirm location" }] : []),
    { title: "Artwork", status: hasArtwork ? "Ready" : "Optional", description: hasArtwork ? "Your saved artwork is in place. Preview the invitation and Hub framing before publishing." : "Add invitation artwork and a Hub header, or keep a text-only invitation. Images aren’t required.", href: `${base}/artwork`, action: hasArtwork ? "Review artwork" : "Choose artwork" },
    { title: "RSVP & Hub", status: rsvpReady ? "Ready" : "Needs attention", description: settings.revision ? `Up to ${settings.settings.rsvp.maxPartySize} per RSVP.${settings.settings.rsvp.deadlineAtUtc ? " Reply deadline set." : ""}${settings.settings.rsvp.capacity != null ? ` ${settings.settings.rsvp.capacity} total guest capacity.` : ""} ${modules.length ? `Hub: ${modules.join(" · ")}.` : "Your Hub shows event details only."}` : "Review and save your RSVP rules and optional Hub features. Suggested defaults haven’t been confirmed yet.", href: `${base}/settings`, action: "Choose the experience" },
    { title: "Hub Content", status: "Available", description: "Prepare things to bring, poll choices and host notes before publishing. Return here to answer guest questions and manage content once the event is live.", href: `${base}/content`, action: "Set up Hub Content" },
    { title: "Preview & publish", status: archived ? "Archived" : missing.length ? "Needs attention" : "Ready", description: archived ? "Restore this event privately before reviewing it for publication." : "Preview both guest pages, then explicitly approve the saved version. Final link and artwork checks happen when you publish.", href: `${base}/preview`, action: "Preview guest pages" },
    { title: "Share", status: published ? "Ready" : "After publishing", description: published ? "Your invitation, Event Hub links and downloadable QR codes are ready. They show the live version, not private edits." : "Invitation and Event Hub links, plus QR codes, become available after you publish. No invitations are sent automatically.", href: `${base}/publish${published ? "#share-event" : ""}`, action: published ? "Get links & QR codes" : archived ? "Restore & review" : "Review & publish" },
  ];
  const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
  return <div className="space-y-6 pb-10">
    <EventSetupNavigation id={draft.id} current="setup" />
    {justSaved && <p role="status" className="rounded-2xl bg-[#e4eee1] p-4 text-sm leading-6 text-[#285630]">Draft saved privately. Let’s bring the rest together.</p>}
    {justCopied && <p role="status" className="rounded-2xl bg-[#e4eee1] p-4 text-sm leading-6 text-[#285630]">Your new private copy is ready. Set fresh dates and review the artwork and wording before publishing. The original event and all its guests are unchanged.</p>}
    <section aria-label="Publication status" className="rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/65 p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">{eventStatus(live)}</p>
      <h2 className="mt-2 break-words font-serif text-3xl">{draft.title}</h2>
      <p className="mt-3 text-sm leading-6 text-[#202523]/75">{archived ? "Private and safely retained. Restore from Publish & share when you need this gathering again; restoring does not publish it." : published ? live.hasUnpublishedChanges ? "Unpublished changes. Guests still see your last published version. Saving in the editors does not update live pages." : "Your saved draft matches the live version. Any new edits stay private until you publish again." : live ? "This event is unpublished. Shared links are unavailable. Review and publish to make it live again." : "Only you can see this draft. Saving details, artwork or settings never makes them public."}</p>
      {live && <Link href={`${base}/guests`} className={`${link} mt-2`}>Manage saved guests &amp; content →</Link>}
    </section>
    {!archived && <section aria-labelledby="setup-next-heading" className="px-1">
      <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">Your next step</p>
      <h2 id="setup-next-heading" className="mt-2 font-serif text-2xl">{missing.length ? `${missing.length} ${missing.length === 1 ? "detail" : "details"} to finish` : published && !live.hasUnpublishedChanges ? "All set for your gathering" : "Ready for your final review"}</h2>
      {missing.length ? <ul className="mt-2 space-y-1">{missing.map(({ message, href }) => <li key={message}><Link href={href} className={link}>{message}</Link></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-[#202523]/65">The saved essentials are ready. Nothing publishes automatically.</p>}
      <Link className="primary-button mt-4 inline-flex min-h-12 items-center px-5 text-sm" href={missing[0]?.href ?? `${base}/publish${published && !live.hasUnpublishedChanges ? "#share-event" : ""}`}>{missing.length ? "Continue setup →" : published && !live.hasUnpublishedChanges ? "Share your event →" : "Review & publish →"}</Link>
    </section>}
    <ol aria-label="Event setup checklist" className="divide-y divide-[#202523]/10 rounded-3xl border border-[#202523]/10 bg-[#fffaf1]/90 px-5 sm:px-7">
      {steps.map((step, index) => <li key={step.title} className="py-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-2xl"><span className="mr-3 font-sans text-xs text-[#355f9e]">0{index + 1}</span>{step.title}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${step.status === "Ready" ? "bg-[#e4eee1] text-[#285630]" : step.status === "Needs attention" ? "bg-[#fff4d8] text-[#765319]" : "bg-[#e9f2f8] text-[#355f9e]"}`}>{step.status}</span></div>
        <p className="mt-3 break-words text-sm leading-6 text-[#202523]/65">{step.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-5"><Link className={link} href={step.href}>{step.action} →</Link>{step.title === "Preview & publish" && <Link className={link} href={`${base}/publish`}>{archived ? "Restore event" : "Review & publish"} →</Link>}</div>
      </li>)}
    </ol>
    <section className="px-1" aria-label="Reuse this setup"><h2 className="font-serif text-2xl">Another gathering like this?</h2><p className="mt-2 text-sm leading-6 text-[#202523]/65">Reuse the saved setup in a new private draft, with fresh dates and no guest activity.</p><Link className={link} href={duplicateEventPath(draft.id)}>Duplicate Event →</Link></section>
  </div>;
}
