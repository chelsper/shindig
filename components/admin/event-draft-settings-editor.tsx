"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { EventDraft } from "../../lib/event-drafts";
import type { DraftArtwork } from "../../lib/event-draft-artwork";
import { DRAFT_HUB_MODULES, draftReadiness, validateDraftSettings, type DraftSettings, type DraftSettingsRecord } from "../../lib/event-draft-settings";
import { saveDraftSettings } from "../../app/admin/events/[id]/settings/actions";
import { EventDraftPreview } from "./event-draft-preview";
import { DraftHubPreview, DraftRsvpPreview } from "./event-draft-experience-preview";
import { EventSetupNavigation } from "./event-setup-navigation";
import type { Coordinates } from "../../lib/event-publication";
import { eventLocalInput, eventLocalToUtc } from "../../lib/event-date-time";
import { MAX_EVENT_CAPACITY } from "../../lib/rsvp-policy";
import { EditorViewToggle, type EditorView } from "./editor-view-toggle";
import { DraftEditorActionBar } from "./draft-editor-action-bar";

const panel = "rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-6";
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/65 px-4 text-xs font-bold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-40";

export function EventDraftSettingsEditor({ draft, artwork, initial, coordinates = null }: { draft: EventDraft; artwork: DraftArtwork; initial: DraftSettingsRecord; coordinates?: Coordinates | null }) {
  const [settings, setSettings] = useState(initial.settings);
  const [deadlineEnabled, setDeadlineEnabled] = useState(Boolean(initial.settings.rsvp.deadlineAtUtc));
  const [deadlineLocal, setDeadlineLocal] = useState(eventLocalInput(initial.settings.rsvp.deadlineAtUtc ?? null, draft.timeZone));
  const [capacityEnabled, setCapacityEnabled] = useState(initial.settings.rsvp.capacity != null);
  const [revision, setRevision] = useState(initial.revision);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<"invitation" | "hub">("invitation");
  const [mobileView, setMobileView] = useState<EditorView>("edit");
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
    if (busy.current || conflict || (!dirty && revision > 0)) return;
    setSaved(false); setError(null);
    if (deadlineEnabled && !eventLocalToUtc(deadlineLocal, draft.timeZone)) {
      setError("Choose a valid RSVP deadline in the event’s timezone. Times skipped or repeated by daylight saving need a different time."); return;
    }
    if (capacityEnabled && settings.rsvp.capacity == null) { setError("Enter a total event capacity, or turn the limit off."); return; }
    const validation = validateDraftSettings(settings);
    if (!validation.ok) { setError(validation.message); return; }
    busy.current = true; setPending(true); setSaved(false); setError(null);
    try {
      const result = await saveDraftSettings({ id: draft.id, revision, settings });
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setRevision(result.revision); setDirty(false); setSaved(true);
    } catch { setError("We couldn’t confirm the save. Your choices are still here; please try again."); }
    finally { busy.current = false; setPending(false); }
  }
  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 pt-6 pb-72 text-[#202523] sm:px-6 sm:pt-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5"><Link href="/admin/events" onClick={leave} className="font-serif text-2xl">Shindig</Link><Link href="/admin/events" onClick={leave} className={button}>Back to your events</Link></header>
      <section className="py-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Event setup · Private draft</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.035em] sm:text-5xl">Make it your kind of gathering</h1>
        <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-[#202523]/65">RSVP &amp; Hub settings for {draft.title}. Keep it simple, or give your guests a few little ways to join in.</p>
        <EventSetupNavigation id={draft.id} current="settings" onNavigate={leave} />
      </section>
      <EditorViewToggle view={mobileView} onChange={setMobileView} editPanelId="settings-edit-panel" previewPanelId="settings-preview-panel" editLabel="Edit settings" />
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
        <div id="settings-edit-panel" className={`min-w-0 space-y-5 ${mobileView === "edit" ? "block" : "hidden lg:block"}`}>
          <form id="event-settings-form" aria-label="RSVP and Hub settings" noValidate onSubmit={save}>
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
              <section id="rsvp-limits" className={`${panel} scroll-mt-6`} aria-labelledby="rsvp-limits-heading">
                <h2 id="rsvp-limits-heading" className="font-serif text-2xl">A little room to plan</h2>
                <p className="mt-2 text-sm leading-6 text-[#202523]/60">Optional limits for this gathering. Both start off. Save and publish to apply changes to guest pages.</p>
                <label className="mt-4 flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-[#355f9e]" checked={deadlineEnabled} onChange={(e) => { setDeadlineEnabled(e.target.checked); setDeadlineLocal(""); change({ ...settings, rsvp: { ...settings.rsvp, deadlineAtUtc: null } }); }} />Set an RSVP deadline</label>
                {deadlineEnabled && <><label className="field-label mt-2">Reply by<input type="datetime-local" className="field-input min-w-0 max-w-full" required value={deadlineLocal} onChange={(e) => { setDeadlineLocal(e.target.value); change({ ...settings, rsvp: { ...settings.rsvp, deadlineAtUtc: eventLocalToUtc(e.target.value, draft.timeZone) } }); }} /></label><p className="mt-2 text-xs leading-5 text-[#202523]/60">Event timezone: {draft.timeZone}. At this time, new replies and guest edits close. Hosts can still make corrections. Choose a deadline at or before the event starts.</p></>}
                <label className="mt-4 flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-[#355f9e]" checked={capacityEnabled} onChange={(e) => { setCapacityEnabled(e.target.checked); change({ ...settings, rsvp: { ...settings.rsvp, capacity: null } }); }} />Limit total event attendance</label>
                {capacityEnabled && <><label className="field-label mt-2">Total guest capacity<input className="field-input" type="number" inputMode="numeric" min="1" max={MAX_EVENT_CAPACITY} step="1" required value={settings.rsvp.capacity ?? ""} onChange={(e) => change({ ...settings, rsvp: { ...settings.rsvp, capacity: e.target.value ? Number(e.target.value) : null } })} /></label><p className="mt-2 text-xs leading-5 text-[#202523]/60">Counts every attending person, including hidden guests and host-added responses. When full, guests can still decline or reduce their party. Host additions must fit too. No waitlist.</p></>}
              </section>
              <section className={panel} aria-labelledby="hub-settings-heading">
                <h2 id="hub-settings-heading" className="font-serif text-2xl">A little more Shindig</h2>
                <p className="mt-2 text-sm leading-6 text-[#202523]/60">Choose what belongs on your Event Hub. Turn everything off for just the event details.</p>
                <div className="mt-3 divide-y divide-[#202523]/10">{DRAFT_HUB_MODULES.map((module) => <label key={module.id} className="flex min-h-20 cursor-pointer items-center gap-4 py-4"><input type="checkbox" className="size-5 shrink-0 accent-[#355f9e]" checked={settings.features[module.id]} onChange={(event) => { change({ ...settings, features: { ...settings.features, [module.id]: event.target.checked } }); setView("hub"); }} /><span className="min-w-0"><span className="block text-sm font-semibold">{module.label}</span><span className="mt-1 block text-xs leading-5 text-[#202523]/60">{module.description}</span></span></label>)}</div>
                <p className="mt-2 text-xs leading-5 text-[#202523]/55">These choices stay private until you publish. Photos aren’t available yet. Save your choices, then prepare items, polls and host notes in Hub Content—even before publishing.</p>
                <Link href={`${base}/content`} onClick={leave} className={`${button} mt-4`}>Set up Hub Content →</Link>
              </section>
            </fieldset>
          </form>
          <section className={panel} aria-labelledby="readiness-heading">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[#355f9e]">Before it goes out</p><h2 id="readiness-heading" className="mt-2 font-serif text-2xl">Getting ready to gather</h2>
            <p className="mt-2 text-sm leading-6 text-[#202523]/60">{remaining ? `${remaining} ${remaining === 1 ? "detail needs" : "details need"} attention before review.` : "Your essentials are ready for the next review step."} Based on saved basics and artwork, plus the choices shown here.</p>
            <ul className="mt-3 divide-y divide-[#202523]/10">{readiness.map((item) => <li key={item.id} className="flex min-h-14 items-center gap-3 py-3 text-sm"><span aria-hidden="true" className={item.complete ? "text-[#285630]" : "text-[#355f9e]"}>{item.complete ? "✓" : "○"}</span><span className="min-w-0 flex-1">{item.href && !item.complete && item.id !== "settings" ? <Link href={item.href} onClick={leave} className="underline underline-offset-4">{item.label}</Link> : item.label}<span className="mt-1 block text-xs text-[#202523]/55">{item.complete ? "Ready" : item.required ? "Needs attention" : "Optional"}</span></span></li>)}</ul>
            <Link href={`${base}/setup`} onClick={leave} className={`${button} mt-4`}>View setup overview →</Link>
            <p className="mt-4 rounded-xl bg-[#e9f2f8]/60 p-3 text-xs leading-5 text-[#355f9e]">These draft choices stay private. Use Review & publish to apply them to guest pages; saving here never changes a live event.</p>
          </section>
        </div>
        <section id="settings-preview-panel" className={`min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 ${mobileView === "preview" ? "block" : "hidden lg:block"}`} aria-label="Guest experience preview">
          <h2 className="font-serif text-2xl">Try the guest’s view</h2><p className="mt-2 text-sm leading-6 text-[#202523]/60">{dirty ? "Includes unsaved choices" : revision === 0 ? "Suggested defaults" : "Private draft preview"} · Saved artwork and event details. Nothing here is live.</p>
          <div role="group" aria-label="Preview screen" className="mb-4 mt-3 flex flex-wrap gap-2">{(["invitation", "hub"] as const).map((screen) => <button key={screen} type="button" className={button} aria-pressed={view === screen} onClick={() => setView(screen)}>{screen === "invitation" ? "Invitation" : "Event Hub"}</button>)}</div>
          <EventDraftPreview draft={draft} artwork={artwork} view={view}>{view === "invitation" ? <DraftRsvpPreview settings={settings} timeZone={draft.timeZone} /> : <DraftHubPreview settings={settings} />}</EventDraftPreview>
        </section>
      </div>
    </div>
    <DraftEditorActionBar formId="event-settings-form" saveLabel="Save settings" saveAccessibleLabel="Save draft settings" saveAllowed={dirty || revision === 0}
      pendingLabel="Saving choices…" pending={pending} dirty={dirty} conflict={conflict} reviewReady={revision > 0} reviewHref={`${base}/publish`}
      error={error} reopenHref={`${base}/settings`} reopenLabel="Reopen saved settings" onLeave={leave}
      status={pending ? "Saving choices privately…" : conflict ? "Reopen the latest settings before saving or reviewing." : dirty ? "You have unsaved choices. Save before reviewing." : saved ? "Choices saved to your private draft. Jasper Shucks and all live RSVPs are unchanged." : revision === 0 ? "Suggested defaults. Save to confirm your choices." : "Your saved choices are up to date. Review does not publish."} />
  </main>;
}
