"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishEvent } from "../../app/admin/events/[id]/publish/actions";
import type { EventDraft } from "../../lib/event-drafts";
import { draftImageUrl, type DraftArtworkRecord } from "../../lib/event-draft-artwork";
import { DRAFT_HUB_MODULES, type DraftSettingsRecord } from "../../lib/event-draft-settings";
import { publicationProblems, parseCoordinates, type Coordinates } from "../../lib/event-publication";
import { draftEventSlug, eventPaths } from "../../lib/event-routes";
import { SHINDIG_SITE } from "../../lib/site";
import { eventStatus, type EventLifecycle } from "../../lib/event-lifecycle";
import { EventLifecycleControls } from "./event-lifecycle-controls";

export function EventPublishReview({ draft, artwork, settings, live, musicConfigured = true }: {
  draft: EventDraft; artwork: DraftArtworkRecord; settings: DraftSettingsRecord;
  live: (EventLifecycle & { revision: number; publishedAt: string; coordinates: Coordinates | null; hasUnpublishedChanges: boolean }) | null;
  musicConfigured?: boolean;
}) {
  const base = `/admin/events/${draft.id}`, paths = eventPaths(draftEventSlug(draft.id));
  const [latitude, setLatitude] = useState(live?.coordinates ? String(live.coordinates.latitude) : "");
  const [longitude, setLongitude] = useState(live?.coordinates ? String(live.coordinates.longitude) : "");
  const [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false), [pending, startTransition] = useTransition();
  const busy = useRef(false), router = useRouter();
  const coordinates = latitude.trim() && longitude.trim() ? parseCoordinates({ latitude: Number(latitude), longitude: Number(longitude) }) : null;
  const problems = publicationProblems({ details: draft, artwork: artwork.settings, settings: settings.settings, coordinates });
  if (!settings.revision) problems.push("Save your RSVP & Hub choices.");
  const versions = { details: draft.revision, artwork: artwork.revision, settings: settings.revision, publication: live?.revision ?? 0 };
  const button = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
  return <div className="space-y-6 pb-10">
    <nav className="flex flex-wrap gap-x-5" aria-label="Event setup"><Link className={button} href="/admin/events">All events</Link><Link className={button} href={base}>Details</Link><Link className={button} href={`${base}/artwork`}>Artwork</Link><Link className={button} href={`${base}/settings`}>RSVP &amp; Hub</Link><Link className={button} href={`${base}/preview`}>Private preview</Link></nav>
    <div role="status" className="text-sm leading-6 text-[#202523]/70"><span className="font-semibold">{eventStatus(live)}</span>{live && <span> · {live.hasUnpublishedChanges ? "Unpublished changes — review the saved version below." : "Saved draft matches the last published version."}</span>}</div>
    {live && <EventLifecycleControls key={live.revision} id={draft.id} live={live} />}
    {live?.visibility === "unpublished" && !success && <section className="rounded-3xl border border-[#b78228]/25 bg-[#fff4d8] p-5 sm:p-7"><h2 className="font-serif text-2xl">Your gathering is private again</h2><p className="mt-2 text-sm leading-6">Shared links are unavailable. Nothing has been deleted. Review the saved version below before republishing; the same links and guest update links will work again.</p><Link className={button} href={`${base}/guests`}>Manage saved responses &amp; content →</Link></section>}
    {(live?.visibility === "published" || success) && <section aria-label="Share your event" className="rounded-3xl border border-[#285630]/20 bg-[#eff5e8] p-5 sm:p-7">
      <h2 className="font-serif text-3xl">Your gathering is live</h2><p className="mt-2 text-sm leading-6">Share either link. {live?.rsvpsOpen === false ? "RSVPs and guest edits are closed; guests can still visit the invitation and Hub." : "Guests can RSVP from the invitation and return to the Hub anytime."}</p>
      {([['Invitation', paths.invitation], ['Event Hub', paths.hub]] as const).map(([label, path]) => <div key={label} className="mt-4"><p className="text-xs font-bold uppercase tracking-wider">{label}</p><a className={`${button} break-all`} href={path} target="_blank" rel="noreferrer">{new URL(path, SHINDIG_SITE.url).toString()} ↗</a><button type="button" className="ml-3 min-h-11 text-sm underline" onClick={() => { void navigator.clipboard.writeText(new URL(path, SHINDIG_SITE.url).toString()).then(() => setMessage(`${label} link copied.`)).catch(() => setMessage("Select and copy the link above.")); }}>Copy link</button></div>)}
      <Link className={button} href={`${base}/guests`}>View event responses →</Link>
      <p className="mt-3 text-xs leading-5">Saved draft edits stay private until you publish changes. Previously shared links remain the same.</p>
    </section>}
    <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">Saved version to publish</p><h2 className="mt-2 break-words font-serif text-3xl">{draft.title}</h2>
      <dl className="mt-5 space-y-4 text-sm leading-6">
        <div><dt className="font-semibold">Invitation</dt><dd>{draft.hostName ? `Hosted by ${draft.hostName}` : "No host name shown"}</dd><dd className="mt-1 whitespace-pre-wrap break-words">{draft.description || "No description"}</dd></div>
        <div><dt className="font-semibold">When</dt><dd>{draft.startsAtUtc ? new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(draft.startsAtUtc)) : "Start time missing"}</dd><dd>{draft.endsAtUtc ? `Ends ${new Intl.DateTimeFormat("en-US", { timeZone: draft.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.endsAtUtc))}` : "End time missing"} · {draft.timeZone}</dd></div>
        <div><dt className="font-semibold">Where</dt><dd>{draft.venue} · {draft.address || "Address missing"}</dd></div>
        <div><dt className="font-semibold">Artwork</dt><dd>{artwork.settings.invitation.path ? "Saved invitation artwork" : "Text-only invitation"}; {artwork.settings.header.path ? "separate Hub header" : "Hub uses invitation artwork when available"}.</dd></div>
        <div><dt className="font-semibold">RSVP</dt><dd>Up to {settings.settings.rsvp.maxPartySize} per response · Comments {settings.settings.rsvp.allowComments ? "on" : "off"} · Guest names {settings.settings.rsvp.guestListDefaultVisible ? "visible" : "hidden"} by default (guests choose).</dd></div>
        <div><dt className="font-semibold">Event Hub</dt><dd>{DRAFT_HUB_MODULES.filter((m) => settings.settings.features[m.id]).map((m) => m.label).join(" · ") || "Event details only"}</dd></div>
      </dl>
      {artwork.settings.invitation.path && <Image className="mt-4 h-auto max-h-64 w-auto rounded-xl" src={draftImageUrl(draft.id, artwork.settings.invitation.path)} alt={artwork.settings.invitation.alt} width={180} height={240} unoptimized />}
      {settings.settings.features.playlist && !musicConfigured && <p className="mt-4 rounded-xl bg-[#fff4d8] p-4 text-sm leading-6">Music search isn’t configured in this environment yet. Saved songs still display, but new suggestions need the Spotify server credentials. You can publish with this temporary unavailable state or turn Playlist off first.</p>}
      {settings.settings.features.weather && <fieldset className="mt-5 rounded-2xl bg-[#e9f2f8]/60 p-4"><legend className="px-1 text-sm font-semibold">Confirm weather location</legend><p className="text-xs leading-5">Use coordinates for the address above, not your current device location. Changing the address requires checking these again. These coordinates will be public.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="field-label">Latitude<input className="field-input" type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => { setLatitude(e.target.value); setConfirmed(false); }} /></label><label className="field-label">Longitude<input className="field-input" type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => { setLongitude(e.target.value); setConfirmed(false); }} /></label></div></fieldset>}
    </section>
    {!success && <form className="rounded-3xl border border-[#355f9e]/20 p-5 sm:p-7" onSubmit={(e) => {
      e.preventDefault(); if (busy.current || !confirmed || problems.length) return;
      busy.current = true; setMessage("");
      startTransition(async () => { try {
        const result = await publishEvent(draft.id, versions, settings.settings.features.weather ? coordinates : null, confirmed);
        if (!result.ok) { setMessage(result.message); return; }
        setSuccess(true); setMessage("Published! Your guest links are ready."); router.refresh();
      } catch { setMessage("Publishing couldn’t be confirmed. Refresh this review before trying again."); }
      finally { busy.current = false; } });
    }}>
      <h2 className="font-serif text-2xl">Ready to invite your people?</h2>
      {problems.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#843528]">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
      <label className="mt-4 flex min-h-12 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={confirmed} disabled={pending} onChange={(e) => setConfirmed(e.target.checked)} /><span>I reviewed the saved details, artwork and settings. Make this version public to anyone with the link.</span></label>
      {live?.rsvpsOpen === false && <p className="mt-3 text-sm leading-6">RSVPs will remain closed after publishing. Use Reopen RSVPs above when you’re ready.</p>}
      <button className="primary-button mt-4 w-full" disabled={!confirmed || problems.length > 0 || pending} type="submit">{pending ? "Publishing…" : live?.visibility === "unpublished" ? "Republish reviewed event" : live ? "Publish changes" : "Publish event"}</button>
      <p className="mt-3 text-xs leading-5 text-[#202523]/60">No invitations or messages will be sent. Jasper Shucks will not change.</p>
    </form>}
    {message && <p role="status" className="rounded-2xl bg-[#e9f2f8] p-4 text-sm leading-6">{message}</p>}
  </div>;
}
