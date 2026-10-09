"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishEvent } from "../../app/admin/events/[id]/publish/actions";
import type { EventDraft } from "../../lib/event-drafts";
import { draftImageUrl, type DraftArtworkRecord } from "../../lib/event-draft-artwork";
import { appearanceSummary } from "../../lib/event-appearance";
import { DRAFT_HUB_MODULES, type DraftSettingsRecord } from "../../lib/event-draft-settings";
import { type Coordinates } from "../../lib/event-publication";
import { publicationIssues, savedWeatherCoordinates } from "../../lib/event-readiness";
import { PublishReadiness, publicationBlocker } from "./publish-readiness";
import { draftEventSlug } from "../../lib/event-routes";
import { suggestEventAlias, validateEventAlias } from "../../lib/event-alias";
import { eventStatus, type EventLifecycle } from "../../lib/event-lifecycle";
import { EventLifecycleControls } from "./event-lifecycle-controls";
import { EventLinkField } from "./event-link-field";
import { EventSharePanel } from "./event-share-panel";
import { EventSetupNavigation } from "./event-setup-navigation";
import { rsvpDeadlineLabel } from "../../lib/rsvp-policy";
import type { PublicationChangeReview as ChangeReview } from "../../lib/event-publication-changes";
import { PublicationChangeReview } from "./publication-change-review";

export function EventPublishReview({ draft, artwork, settings, live, changeReview, musicConfigured = true }: {
  draft: EventDraft; artwork: DraftArtworkRecord; settings: DraftSettingsRecord;
  changeReview: ChangeReview | null;
  live: (EventLifecycle & { revision: number; publishedAt: string; coordinates: Coordinates | null; hasUnpublishedChanges: boolean; publicAlias?: string | null; title?: string }) | null;
  musicConfigured?: boolean;
}) {
  const base = `/admin/events/${draft.id}`;
  const [alias, setAlias] = useState(live ? live.publicAlias ?? "" : suggestEventAlias(draft.title));
  const [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false), [pending, startTransition] = useTransition();
  const busy = useRef(false), router = useRouter();
  const coordinates = savedWeatherCoordinates(draft);
  const problems = publicationIssues({ details: draft, artwork: artwork.settings, settings: settings.settings, coordinates }).map((issue) => publicationBlocker(draft.id, issue));
  if (!settings.revision) problems.push({ id: "settings", message: "Save your RSVP & Hub choices.", href: `${base}/settings` });
  if (live && !changeReview) problems.push({ id: "comparison", message: "Reload this page to review the latest published changes.", href: "#publication-changes" });
  const parsedAlias = validateEventAlias(alias);
  if (!parsedAlias.ok) problems.push({ id: "alias", message: parsedAlias.message, href: "#event-link" });
  const versions = { details: draft.revision, artwork: artwork.revision, settings: settings.revision, publication: live?.revision ?? 0 };
  const archived = live?.visibility === "archived";
  const button = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
  return <div className="space-y-6 pb-10">
    <EventSetupNavigation id={draft.id} current="publish" onNavigate={(event) => { if (busy.current) event.preventDefault(); }} />
    <div role="status" className="text-sm leading-6 text-[#202523]/70"><span className="font-semibold">{eventStatus(live)}</span>{live && <span> · {live.hasUnpublishedChanges ? changeReview?.changeCount === 0 ? "Saved again — no content changes from the last published version." : "Unpublished changes — review the saved version below." : "Saved draft matches the last published version."}</span>}</div>
    {!archived && !success && <PublishReadiness id={draft.id} blockers={problems} />}
    {live && <EventLifecycleControls key={live.revision} id={draft.id} live={live} />}
    {archived && <section className="rounded-3xl border border-[#202523]/15 bg-[#e9f2f8]/50 p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Everything is saved</h2>
      <p className="mt-2 text-sm leading-6">Guest responses, artwork, playlist suggestions, questions, updates and polls stay with this event. Host tools and CSV export remain available. Nothing can be republished until you restore the event.</p>
      <div className="mt-3 flex flex-wrap gap-x-5"><Link className={button} href={`${base}/guests`}>Manage saved responses &amp; content →</Link><a className={button} href={`${base}/guests/export`}>Export all RSVPs</a><Link className={button} href="/admin/events?view=archived">Archived events</Link></div>
    </section>}
    {live?.visibility === "unpublished" && !success && <section className="rounded-3xl border border-[#b78228]/25 bg-[#fff4d8] p-5 sm:p-7"><h2 className="font-serif text-2xl">Your gathering is private again</h2><p className="mt-2 text-sm leading-6">Shared links are unavailable. Nothing has been deleted. Review the saved version below before republishing; the same links and guest update links will work again.</p><Link className={button} href={`${base}/guests`}>Manage saved responses &amp; content →</Link></section>}
    {!success && <PublicationChangeReview id={draft.id} review={changeReview} visibility={live?.visibility ?? null} savedAgain={live?.hasUnpublishedChanges} />}
    {(live?.visibility === "published" || success) && <div id="share-event" className="scroll-mt-6"><EventSharePanel id={draft.id} publicSlug={(parsedAlias.ok && parsedAlias.alias) || draftEventSlug(draft.id)} title={success ? draft.title : live?.title ?? draft.title} rsvpsOpen={live?.rsvpsOpen !== false} /></div>}
    {!live && !success && <EventLinkField id={draft.id} value={alias} disabled={pending} onChange={(value) => { setAlias(value); setConfirmed(false); setMessage(""); }} />}
    <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">{archived ? "Private working copy" : "Saved version to publish"}</p><h2 className="mt-2 break-words font-serif text-3xl">{draft.title}</h2>
      <dl className="mt-5 space-y-4 text-sm leading-6">
        <div><dt className="font-semibold">Invitation</dt><dd>{draft.hostName ? `Hosted by ${draft.hostName}` : "No host name shown"}</dd><dd className="mt-1 whitespace-pre-wrap break-words">{draft.description || "No description"}</dd></div>
        <div><dt className="font-semibold">When</dt><dd>{draft.startsAtUtc ? new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(draft.startsAtUtc)) : "Start time missing"}</dd><dd>{draft.endsAtUtc ? `Ends ${new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.endsAtUtc))}` : "End time missing"} · {draft.timeZone}</dd></div>
        <div><dt className="font-semibold">Where</dt><dd>{draft.venue} · {draft.address || "Address missing"}</dd></div>
        <div><dt className="font-semibold">Design &amp; artwork</dt><dd>{artwork.settings.design ? `${appearanceSummary(artwork.settings.design)} · saved invitation and Hub framing` : "Original layout"}. {artwork.settings.invitation.path ? "Saved invitation artwork" : "Text-only invitation"}; {artwork.settings.header.path ? "separate Hub header" : "Hub uses invitation artwork when available"}.</dd></div>
        <div><dt className="font-semibold">RSVP</dt><dd>Up to {settings.settings.rsvp.maxPartySize} per response · Comments {settings.settings.rsvp.allowComments ? "on" : "off"} · Guest names {settings.settings.rsvp.guestListDefaultVisible ? "visible" : "hidden"} by default (guests choose).</dd></div>
        <div><dt className="font-semibold">Hub Content</dt><dd>Prepared items and host notes, ready polls, and approved answers become visible with their enabled features when you publish. Poll drafts stay private. Content edits after publication can take effect immediately.</dd><dd><Link className={button} href={`${base}/content`}>Review Hub Content →</Link></dd></div>
        <div><dt className="font-semibold">Reply deadline &amp; capacity</dt><dd>{settings.settings.rsvp.deadlineAtUtc ? `Guest replies and edits close ${rsvpDeadlineLabel(settings.settings.rsvp.deadlineAtUtc, draft.timeZone)}. If that time has already passed, guest replies will be closed as soon as you publish.` : "No RSVP deadline."}</dd><dd>{settings.settings.rsvp.capacity == null ? "No total attendance limit." : `${settings.settings.rsvp.capacity} guests maximum, including hidden guests and host-added responses. Publishing cannot reduce capacity below current attendance.`}</dd><dd><Link className={button} href={`${base}/settings#rsvp-limits`}>Adjust draft limits →</Link></dd></div>
        <div><dt className="font-semibold">Event Hub</dt><dd>{DRAFT_HUB_MODULES.filter((m) => settings.settings.features[m.id]).map((m) => m.label).join(" · ") || "Event details only"}</dd></div>
      </dl>
      {artwork.settings.invitation.path && <Image className="mt-4 h-auto max-h-64 w-auto rounded-xl" src={draftImageUrl(draft.id, artwork.settings.invitation.path)} alt={artwork.settings.invitation.alt} width={180} height={240} unoptimized />}
      {!archived && settings.settings.features.playlist && !musicConfigured && <p className="mt-4 rounded-xl bg-[#fff4d8] p-4 text-sm leading-6">Music search isn’t configured in this environment yet. Saved songs still display, but new suggestions need the Spotify server credentials. You can publish with this temporary unavailable state or turn Playlist off first.</p>}
      {!archived && settings.settings.features.weather && <section id="weather-location" className="mt-5 scroll-mt-6 rounded-2xl bg-[#e9f2f8]/60 p-4"><h3 className="text-sm font-semibold">{coordinates ? "Weather location confirmed" : "Weather location needs confirmation"}</h3><p className="mt-2 break-words text-xs leading-5">{coordinates ? `${draft.location?.matchedAddress} · ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}` : "Find and confirm the event address in Location. It stays saved with your private draft."}</p><Link className={button} href={`${base}/location`}>{coordinates ? "Review saved location →" : "Confirm location →"}</Link></section>}
    </section>
    {!success && !archived && <form className="rounded-3xl border border-[#355f9e]/20 p-5 sm:p-7" onSubmit={(e) => {
      e.preventDefault(); if (busy.current || !confirmed || problems.length || archived) return;
      busy.current = true; setMessage("");
      startTransition(async () => { try {
        const result = await publishEvent(draft.id, versions, settings.settings.features.weather ? coordinates : null, confirmed, alias);
        if (!result.ok) { setMessage(result.message); return; }
        setSuccess(true); setMessage("Published! Your guest links are ready."); router.refresh();
      } catch { setMessage("Publishing couldn’t be confirmed. Refresh this review before trying again."); }
      finally { busy.current = false; } });
    }}>
      <h2 className="font-serif text-2xl">Ready to invite your people?</h2>
      {problems.length > 0 && <p className="mt-3 text-sm leading-6 text-[#765319]">Publishing is waiting for {problems.length === 1 ? "one setup detail" : `${problems.length} setup details`}. <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="#publish-readiness">Show me what to finish →</Link></p>}
      <label className="mt-4 flex min-h-12 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={confirmed} disabled={pending} onChange={(e) => setConfirmed(e.target.checked)} /><span>{live ? "I reviewed the changes above and the saved details, artwork and settings." : "I reviewed the saved details, artwork and settings."} Make this version public to anyone with the link.</span></label>
      {live?.rsvpsOpen === false && <p className="mt-3 text-sm leading-6">RSVPs will remain closed after publishing. Use Reopen RSVPs above when you’re ready.</p>}
      <button className="primary-button mt-4 w-full" aria-describedby={problems.length ? "publish-readiness-heading" : undefined} disabled={!confirmed || problems.length > 0 || pending} type="submit">{pending ? "Publishing…" : problems.length ? "Finish setup to publish" : live?.visibility === "unpublished" ? "Republish reviewed event" : live ? "Publish changes" : "Publish event"}</button>
      <p className="mt-3 text-xs leading-5 text-[#202523]/60">No invitations or messages will be sent. Jasper Shucks will not change.</p>
    </form>}
    {message && <p role="status" className="rounded-2xl bg-[#e9f2f8] p-4 text-sm leading-6">{message}</p>}
  </div>;
}
