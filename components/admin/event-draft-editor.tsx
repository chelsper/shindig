"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { saveEventDraft } from "../../app/admin/events/actions";
import { DRAFT_LIMITS, EMPTY_EVENT_DRAFT, validateDraftForm, type EventDraft } from "../../lib/event-drafts";
import { eventLocalInput } from "../../lib/event-date-time";
import { EventSetupNavigation } from "./event-setup-navigation";
import { getEventDesign, type EventDesignId } from "../../lib/event-design";
import { EMPTY_DRAFT_ARTWORK } from "../../lib/event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS } from "../../lib/event-draft-settings";
import type { EventEditorPreviewContext } from "../../lib/event-editor-preview";
import { EventEditorPreview } from "./event-editor-preview";
import { EventEditorActions } from "./event-editor-actions";
import { EditorViewToggle } from "./editor-view-toggle";

const panel = "rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/65 px-4 text-xs font-bold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4";

export function EventDraftEditor({ id, initialDraft, timeZones, justSaved = false, requestedDesign, previewContext }: { id: string; initialDraft?: EventDraft; timeZones: string[]; justSaved?: boolean; requestedDesign?: EventDesignId; previewContext?: EventEditorPreviewContext | null }) {
  const router = useRouter();
  const initial = initialDraft ?? EMPTY_EVENT_DRAFT;
  const [fields, setFields] = useState(() => ({ ...initial, startsAtLocal: eventLocalInput(initial.startsAtUtc, initial.timeZone), endsAtLocal: eventLocalInput(initial.endsAtUtc, initial.timeZone) }));
  const [revision, setRevision] = useState(initialDraft?.revision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(justSaved);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const busy = useRef(false);
  const context = initialDraft ? previewContext ?? null : { artwork: EMPTY_DRAFT_ARTWORK, settings: { settings: DEFAULT_DRAFT_SETTINGS, revision: 0 } };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(key: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setDirty(true); setSaved(false); setError(null);
  }
  function allowLeave() { return !busy.current && (!dirty || window.confirm("Leave without saving your draft changes?")); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || conflict) return;
    const validation = validateDraftForm(fields);
    if (!validation.ok) { setError(validation.message); setSaved(false); return; }
    busy.current = true; setError(null); setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveEventDraft({ id, revision, fields });
        if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
        setRevision(result.revision); setDirty(false); setSaved(true);
        if (revision === 0) router.replace(requestedDesign ? `/admin/events/${result.id}/artwork?style=${requestedDesign}` : `/admin/events/${result.id}/setup?saved=1`);
      } catch { setError("We couldn’t confirm the save. Your changes are still here. Please try again."); }
      finally { busy.current = false; }
    });
  }
  const textField = (key: keyof typeof DRAFT_LIMITS, label: string, placeholder?: string) => <label className="field-label min-w-0">{label}
    <input className="field-input min-w-0" name={key} required={key === "title"} maxLength={DRAFT_LIMITS[key]} value={fields[key]} onChange={(event) => change(key, event.target.value)} placeholder={placeholder} />
  </label>;

  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 pt-6 pb-64 text-[#202523] sm:px-6 sm:pt-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5">
        <Link href="/admin/events" className="font-serif text-2xl" onClick={(event) => { if (!allowLeave()) event.preventDefault(); }}>Shindig</Link>
        <Link href="/admin/events" className={secondary} onClick={(event) => { if (!allowLeave()) event.preventDefault(); }}>Back to your events</Link>
      </header>
      <section className="py-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Host Dashboard · Private draft</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">{initialDraft ? "A Shindig in the making" : "Let’s make a Shindig"}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#202523]/65">Start with a name and watch the invitation take shape. Save privately, then review when you’re ready. Nothing here publishes automatically.</p>
        {initialDraft && <EventSetupNavigation id={id} current="details" onNavigate={(event) => { if (!allowLeave()) event.preventDefault(); }} />}
      </section>
      <EditorViewToggle view={mobileView} onChange={setMobileView} editPanelId="event-edit-panel" previewPanelId="event-preview-panel" editLabel="Edit details" previewLabel="Preview invitation" />
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
      <form id="event-details-form" aria-label="Event details" noValidate onSubmit={submit} className={`min-w-0 ${mobileView === "edit" ? "block" : "hidden lg:block"}`}>
        <div id="event-edit-panel">
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <section className={panel} aria-labelledby="draft-basics-heading">
            <h2 id="draft-basics-heading" className="font-serif text-2xl">The good idea</h2>
            <div className="mt-5 grid gap-5">
              {textField("title", "Event name", "A backyard birthday, a just-because dinner…")}
              <label className="field-label">Description (optional)<textarea className="field-input min-h-28 resize-y py-3" name="description" rows={4} maxLength={DRAFT_LIMITS.description} value={fields.description} onChange={(event) => change("description", event.target.value)} /></label>
              {textField("hostName", "Hosted by (optional)")}
            </div>
          </section>
          <section className={panel} aria-labelledby="draft-date-heading">
            <h2 id="draft-date-heading" className="font-serif text-2xl">When shall we?</h2>
            <p className="mt-2 text-sm leading-6 text-[#202523]/60">Dates can stay blank while you draft. A start and end time are required before publishing, so guests get accurate calendar entries.</p>
            <div className="mt-5 grid gap-5">
              <label className="field-label min-w-0">Event timezone<select name="timeZone" className="field-input min-w-0 max-w-full" value={fields.timeZone} onChange={(event) => change("timeZone", event.target.value)}>
                {timeZones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
              </select></label>
              <p className="-mt-3 text-xs leading-5 text-[#202523]/60">Times below use this timezone, not your device’s. Changing the timezone keeps the clock times you entered.</p>
              <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                <label className="field-label min-w-0">Starts (optional)<input name="startsAtLocal" type="datetime-local" className="field-input min-w-0 max-w-full" min="2000-01-01T00:00" max="2099-12-31T23:59" value={fields.startsAtLocal} onChange={(event) => change("startsAtLocal", event.target.value)} /></label>
                <label className="field-label min-w-0">Ends (optional)<input name="endsAtLocal" type="datetime-local" className="field-input min-w-0 max-w-full" min="2000-01-01T00:00" max="2099-12-31T23:59" value={fields.endsAtLocal} onChange={(event) => change("endsAtLocal", event.target.value)} /></label>
              </div>
            </div>
          </section>
          <section className={panel} aria-labelledby="draft-place-heading">
            <h2 id="draft-place-heading" className="font-serif text-2xl">A place to gather</h2>
            <p className="mt-2 text-sm leading-6 text-[#202523]/60">These details are optional while you’re planning.</p>
            <div className="mt-5 grid gap-5">
              {textField("venue", "Venue (optional)", "The backyard")}
              {textField("address", "Address (optional)")}
              {textField("cityLabel", "City / area (optional)")}
            </div>
          </section>
          <section className={`${panel} border-[#355f9e]/20`} aria-label="Save private draft">
            <p className="text-sm leading-6 text-[#202523]/65">{initialDraft ? "Save changes privately, then use Review & publish to update your guest pages. Saving this draft never changes a published version." : "Private to the host dashboard. Save your event basics to continue to artwork and RSVP & Hub settings. There is no guest link yet."}</p>
            {requestedDesign && !initialDraft && <p className="mt-4 text-sm leading-6 text-[#355f9e]">Next: apply {getEventDesign(requestedDesign).name} and add artwork. Nothing is published by saving this draft.</p>}
          </section>
        </fieldset>
        </div>
      </form>
      <aside id="event-preview-panel" className={`min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 ${mobileView === "preview" ? "block" : "hidden lg:block"}`}>
        <EventEditorPreview id={id} fields={fields} context={context} dirty={dirty} />
      </aside>
      </div>
    </div>
    <EventEditorActions id={id} revision={revision} dirty={dirty} pending={pending} conflict={conflict} hasTitle={Boolean(fields.title.trim())} error={error} saved={saved} onLeave={(event) => { if (!allowLeave()) event.preventDefault(); }} />
  </main>;
}
