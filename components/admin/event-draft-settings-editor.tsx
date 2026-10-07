"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { EventDraft } from "../../lib/event-drafts";
import type { DraftArtwork } from "../../lib/event-draft-artwork";
import { DRAFT_HUB_MODULES, draftReadiness, type DraftSettings, type DraftSettingsRecord } from "../../lib/event-draft-settings";
import { saveDraftSettings } from "../../app/admin/events/[id]/settings/actions";
import { EventDraftPreview } from "./event-draft-preview";
import { DraftHubPreview, DraftRsvpPreview } from "./event-draft-experience-preview";
import { EventSetupNavigation } from "./event-setup-navigation";
import type { Coordinates } from "../../lib/event-publication";

const panel = "rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-6";
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/65 px-4 text-xs font-bold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-40";

export function EventDraftSettingsEditor({ draft, artwork, initial, coordinates = null }: { draft: EventDraft; artwork: DraftArtwork; initial: DraftSettingsRecord; coordinates?: Coordinates | null }) {
  const [settings, setSettings] = useState(initial.settings);
  const [revision, setRevision] = useState(initial.revision);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<"invitation" | "hub">("invitation");
  const busy = useRef(false);
  const base = `/admin/events/${draft.id}`;
  const readiness = draftReadiness(draft, artwork, settings, revision > 0 && !dirty, coordinates);
  const remaining = readiness.filter((item) => item.required && !item.complete).length;
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (busy.current || (dirty && !window.confirm("Leave without saving your RSVP and Hub choices?"))) event.preventDefault();
  }
  function change(next: DraftSettings) {
    setSettings(next); setDirty(true); setSaved(false); setError(null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || conflict) return;
    busy.current = true; setPending(true); setSaved(false); setError(null);
    try {
      const result = await saveDraftSettings({ id: draft.id, revision, settings });
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setRevision(result.revision); setDirty(false); setSaved(true);
    } catch { setError("We couldn’t confirm the save. Your choices are still here; please try again."); }
    finally { busy.current = false; setPending(false); }
  }
  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5"><Link href="/admin/events" onClick={leave} className="font-serif text-2xl">Shindig</Link><Link href="/admin/events" onClick={leave} className={button}>Back to your events</Link></header>
      <section className="py-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Event setup · Private draft</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.035em] sm:text-5xl">Make it your kind of gathering</h1>
        <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-[#202523]/65">RSVP &amp; Hub settings for {draft.title}. Keep it simple, or give your guests a few little ways to join in.</p>
        <EventSetupNavigation id={draft.id} current="settings" onNavigate={leave} />
      </section>
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,390px)]">
        <div className="min-w-0 space-y-5">
          <form onSubmit={save}>
            <fieldset disabled={pending || conflict} className="min-w-0 space-y-5">
              <section className={panel} aria-labelledby="rsvp-settings-heading">
                <h2 id="rsvp-settings-heading" className="font-serif text-2xl">The reply, your way</h2>
                <p className="mt-2 text-sm leading-6 text-[#202523]/60">A name is always required. Guests can attend or decline without an account.</p>
                <label className="field-label mt-5">Maximum guests per RSVP<select className="field-input" value={settings.rsvp.maxPartySize} onChange={(event) => change({ ...settings, rsvp: { ...settings.rsvp, maxPartySize: Number(event.target.value) } })}>{Array.from({ length: 20 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label>
                <p className="mt-2 text-xs leading-5 text-[#202523]/55">Includes the person replying. This is a per-household limit, not an event capacity.</p>
                <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-[#355f9e]" checked={settings.rsvp.allowComments} onChange={(event) => change({ ...settings, rsvp: { ...settings.rsvp, allowComments: event.target.checked } })} />Allow an optional comment</label>
                <p className="text-xs leading-5 text-[#202523]/55">Comments are visible only to the host, never on the public guest list.</p>
                {settings.features.guestList && <div className="mt-5 border-t border-[#202523]/10 pt-4"><label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-[#355f9e]" checked={settings.rsvp.guestListDefaultVisible} onChange={(event) => change({ ...settings, rsvp: { ...settings.rsvp, guestListDefaultVisible: event.target.checked } })} />Start “Show my name” checked</label><p className="mt-1 text-xs leading-5 text-[#202523]/55">Attending guests can always change this choice. Hidden names stay private but still count toward attendance. Declined guests never appear.</p></div>}
              </section>
              <section className={panel} aria-labelledby="hub-settings-heading">
                <h2 id="hub-settings-heading" className="font-serif text-2xl">A little more Shindig</h2>
                <p className="mt-2 text-sm leading-6 text-[#202523]/60">Choose what belongs on your Event Hub. Turn everything off for just the event details.</p>
                <div className="mt-3 divide-y divide-[#202523]/10">{DRAFT_HUB_MODULES.map((module) => <label key={module.id} className="flex min-h-20 cursor-pointer items-center gap-4 py-4"><input type="checkbox" className="size-5 shrink-0 accent-[#355f9e]" checked={settings.features[module.id]} onChange={(event) => { change({ ...settings, features: { ...settings.features, [module.id]: event.target.checked } }); setView("hub"); }} /><span className="min-w-0"><span className="block text-sm font-semibold">{module.label}</span><span className="mt-1 block text-xs leading-5 text-[#202523]/60">{module.description}</span></span></label>)}</div>
                <p className="mt-2 text-xs leading-5 text-[#202523]/55">These choices stay private until you publish. Review provider setup before publishing. Photos and Potluck aren’t available yet.</p>
              </section>
            </fieldset>
            <section className={`${panel} mt-5`} aria-label="Save private settings">
              {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-900">{error}</p>}
              {conflict && <a href={`${base}/settings`} onClick={leave} className={`${button} mb-4`}>Reopen saved settings</a>}
              {saved && <p role="status" className="mb-4 rounded-xl bg-[#e4eee1] p-3 text-sm leading-6 text-[#285630]">Choices saved to your private draft. Jasper Shucks and all live RSVPs are unchanged.</p>}
              <button type="submit" className="primary-button w-full" disabled={pending || conflict || (!dirty && revision > 0)}>{pending ? "Saving choices…" : "Save draft settings"}</button>
              <p className="mt-3 text-center text-xs leading-5 text-[#202523]/55">{dirty ? "You have unsaved choices." : revision === 0 ? "Suggested defaults. Save to confirm your choices." : "Your saved choices are up to date."}</p>
            </section>
          </form>
          <section className={panel} aria-labelledby="readiness-heading">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[#355f9e]">Before it goes out</p><h2 id="readiness-heading" className="mt-2 font-serif text-2xl">Getting ready to gather</h2>
            <p className="mt-2 text-sm leading-6 text-[#202523]/60">{remaining ? `${remaining} ${remaining === 1 ? "detail needs" : "details need"} attention before review.` : "Your essentials are ready for the next review step."} Based on saved basics and artwork, plus the choices shown here.</p>
            <ul className="mt-3 divide-y divide-[#202523]/10">{readiness.map((item) => <li key={item.id} className="flex min-h-14 items-center gap-3 py-3 text-sm"><span aria-hidden="true" className={item.complete ? "text-[#285630]" : "text-[#355f9e]"}>{item.complete ? "✓" : "○"}</span><span className="min-w-0 flex-1">{item.href && !item.complete && item.id !== "settings" ? <Link href={item.href} onClick={leave} className="underline underline-offset-4">{item.label}</Link> : item.label}<span className="mt-1 block text-xs text-[#202523]/55">{item.complete ? "Ready" : item.required ? "Needs attention" : "Optional"}</span></span></li>)}</ul>
            <Link href={`${base}/setup`} onClick={leave} className={`${button} mt-4`}>View setup overview →</Link>
            <p className="mt-4 rounded-xl bg-[#e9f2f8]/60 p-3 text-xs leading-5 text-[#355f9e]">These draft choices stay private. Use Review & publish to apply them to guest pages; saving here never changes a live event.</p>
          </section>
        </div>
        <section className="min-w-0 self-start md:sticky md:top-6" aria-label="Guest experience preview">
          <h2 className="font-serif text-2xl">Try the guest’s view</h2><p className="mt-2 text-sm leading-6 text-[#202523]/60">Your current choices, with saved artwork and event details. Nothing here is live.</p>
          <div role="group" aria-label="Preview screen" className="mb-4 mt-3 flex flex-wrap gap-2">{(["invitation", "hub"] as const).map((screen) => <button key={screen} type="button" className={button} aria-pressed={view === screen} onClick={() => setView(screen)}>{screen === "invitation" ? "Invitation" : "Event Hub"}</button>)}</div>
          <EventDraftPreview draft={draft} artwork={artwork} view={view}>{view === "invitation" ? <DraftRsvpPreview settings={settings} /> : <DraftHubPreview settings={settings} />}</EventDraftPreview>
        </section>
      </div>
    </div>
  </main>;
}
