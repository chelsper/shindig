"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { EventDraft } from "../../lib/event-drafts";
import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_TYPES, isDraftImagePath, validateDraftArtwork, type DraftArtwork, type DraftArtworkRecord, type DraftImageKind } from "../../lib/event-draft-artwork";
import { saveDraftArtwork } from "../../app/admin/events/[id]/artwork/actions";
import { EventDraftPreview } from "./event-draft-preview";
import { EventSetupNavigation } from "./event-setup-navigation";
import { DraftDesignControls } from "./draft-design-controls";
import { PreviewFrame } from "../design-studio/preview-frame";
import type { DesignPreviewDevice } from "../../lib/design-preview";
import { getEventDesign, type EventDesignId } from "../../lib/event-design";
import { defaultArtworkCrop } from "../../lib/design-artwork";
import { EditorViewToggle, type EditorView } from "./editor-view-toggle";
import { DraftEditorActionBar } from "./draft-editor-action-bar";

const panel = "rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-6";
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/65 px-4 text-xs font-bold text-[#214e91] disabled:opacity-40";

export function EventDraftArtworkEditor({ draft, initial, uploadConfigured, requestedDesign }: { draft: EventDraft; initial: DraftArtworkRecord; uploadConfigured: boolean; requestedDesign?: EventDesignId }) {
  const [settings, setSettings] = useState(initial.settings);
  const [revision, setRevision] = useState(initial.revision);
  const [view, setView] = useState<"invitation" | "hub">("invitation");
  const [device, setDevice] = useState<DesignPreviewDevice>("phone");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [mobileView, setMobileView] = useState<EditorView>("edit");
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (lock.current || (dirty && !window.confirm("Leave without saving your artwork changes?"))) event.preventDefault();
  }
  function update(kind: DraftImageKind, patch: Partial<DraftArtwork["header"]>) {
    setSettings((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
    setDirty(true); setMessage(null); setError(null);
  }
  async function upload(kind: DraftImageKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || lock.current || conflict || !uploadConfigured) return;
    setError(null); setMessage(null);
    if (!DRAFT_IMAGE_TYPES.some((type) => type === file.type) || file.size > DRAFT_IMAGE_LIMIT || file.size === 0) { setError("Choose a JPG, PNG, WebP, or AVIF image up to 4 MB."); return; }
    lock.current = true; setBusy(`Uploading ${kind === "header" ? "header" : "invitation"}…`);
    try {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 12000 && bitmap.height <= 12000;
      bitmap.close();
      if (!valid) { setError("Choose an image no larger than 12,000 pixels per side."); return; }
      const form = new FormData(); form.set("kind", kind); form.set("file", file);
      const response = await fetch(`/admin/events/${draft.id}/artwork/image`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !isDraftImagePath(draft.id, result.path, kind)) { setError(typeof result.error === "string" ? result.error : "The image couldn’t upload. Please try again."); return; }
      update(kind, { path: result.path });
      setView(kind === "header" ? "hub" : "invitation");
      setMessage("Uploaded privately. Add an image description, then save the artwork.");
    } catch { setError("The image couldn’t upload. Please try another image or try again shortly."); }
    finally { lock.current = false; setBusy(null); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || conflict || !dirty) return;
    setError(null); setMessage(null);
    const validation = validateDraftArtwork(draft.id, settings);
    if (!validation.ok) { setError(validation.message); return; }
    lock.current = true; setBusy("Saving artwork…");
    try {
      const result = await saveDraftArtwork({ id: draft.id, revision, settings });
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setRevision(result.revision); setDirty(false); setMessage("Design & artwork saved to your private draft. Nothing has been published.");
    } catch { setError("We couldn’t confirm the save. Your changes are still here; please try again."); }
    finally { lock.current = false; setBusy(null); }
  }
  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 pt-6 pb-72 text-[#202523] sm:px-6 sm:pt-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5"><Link href="/admin/events" className="font-serif text-2xl" onClick={leave}>Shindig</Link><Link href={`/admin/events/${draft.id}/setup`} className={button} onClick={leave}>Back to overview</Link></header>
      <section className="py-7"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Event setup · Private draft</p><h1 className="mt-2 font-serif text-4xl sm:text-5xl">Set the scene</h1><p className="mt-3 break-words text-sm leading-6 text-[#202523]/65">Artwork for {draft.title}. Give the invitation its own look, then frame a header for the Event Hub.</p><EventSetupNavigation id={draft.id} current="artwork" onNavigate={leave} /></section>
      <EditorViewToggle view={mobileView} onChange={setMobileView} editPanelId="artwork-edit-panel" previewPanelId="artwork-preview-panel" editLabel="Edit artwork" />
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
        <form id="event-artwork-form" aria-label="Artwork and design" noValidate onSubmit={save} className={`min-w-0 ${mobileView === "edit" ? "block" : "hidden lg:block"}`}>
          <fieldset id="artwork-edit-panel" disabled={Boolean(busy) || conflict} className="min-w-0 space-y-5">
            {requestedDesign && <section className={`${panel} border-[#355f9e]/30`} aria-label="Design from the playground">
              <h2 className="font-serif text-2xl">Bring {getEventDesign(requestedDesign).name} to this event</h2>
              <p className="mt-2 text-sm leading-6 text-[#202523]/65">Your style choice came from the playground. Its sample details, local artwork and crops haven’t been copied. Your existing event artwork stays in place.</p>
              <button type="button" className={`${button} mt-3`} disabled={Boolean(busy) || conflict || settings.design?.style === requestedDesign} onClick={() => { setSettings((current) => ({ ...current, design: { style: requestedDesign, invitationCrop: current.design?.invitationCrop ?? defaultArtworkCrop() } })); setDirty(true); setMessage(null); setError(null); }}>{settings.design?.style === requestedDesign ? `${getEventDesign(requestedDesign).name} selected` : `Apply ${getEventDesign(requestedDesign).name}`}</button>
              <p className="mt-2 text-xs leading-5 text-[#202523]/60">Choose Save artwork in the bottom bar, then Review &amp; publish. Applying a style here does not save or publish it.</p>
            </section>}
            <DraftDesignControls id={draft.id} settings={settings} view={view} onViewChange={setView} device={device} disabled={Boolean(busy) || conflict} onChange={(next) => { setSettings(next); setDirty(true); setMessage(null); setError(null); }} />
            {!uploadConfigured && <p role="status" className="rounded-2xl bg-[#fff4d8] p-4 text-sm leading-6 text-[#765319]">Uploads need a private Vercel Blob store. Add EVENT_DRAFT_BLOB_READ_WRITE_TOKEN to the server environment. Draft artwork is never stored in the live event’s public image store.</p>}
            {(["invitation", "header"] as const).map((kind) => <section key={kind} className={panel}>
              <h2 className="font-serif text-2xl">{kind === "invitation" ? "Invitation artwork" : "Event Hub header"}</h2>
              <p className="mt-2 text-sm leading-6 text-[#202523]/60">{kind === "invitation" ? settings.design ? "A 4:5 frame, using your invitation crop above." : "Shown in full, without cropping." : "Upload a separate image, or use the invitation artwork. Its framing is independent of the invitation."}</p>
              <label className="field-label mt-4">{kind === "invitation" ? "Upload invitation artwork" : "Upload a separate header"}<input type="file" accept={DRAFT_IMAGE_TYPES.join(",")} disabled={!uploadConfigured || conflict} onChange={(event) => void upload(kind, event)} className="field-input max-w-full cursor-pointer py-3 text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#e9f2f8] file:px-3 file:py-2 file:text-xs" /></label>
              <p className="mt-2 text-xs leading-5 text-[#202523]/55">JPG, PNG, WebP or AVIF · Up to 4 MB</p>
              {settings[kind].path && <><label className="field-label mt-4">{kind === "invitation" ? "Invitation image description" : "Header image description"}<input className="field-input" value={settings[kind].alt} onChange={(event) => update(kind, { alt: event.target.value })} maxLength={180} required /></label><button className="mt-3 min-h-11 text-xs text-[#355f9e] underline underline-offset-4" type="button" onClick={() => update(kind, { path: null, alt: "" })}>{kind === "invitation" ? "Remove from draft" : "Use invitation artwork instead"}</button></>}
              {kind === "header" && !settings.design && <div className="mt-5 space-y-4">{([ ["focalX", "Horizontal focus", 0, 100], ["focalY", "Vertical focus", 0, 100], ["zoomPercent", "Zoom", 100, 200] ] as const).map(([key, label, min, max]) => <label key={key} className="block text-xs font-semibold text-[#202523]/70">{label} <span className="float-right text-[#355f9e]">{settings.header[key]}%</span><input type="range" className="mt-2 min-h-8 w-full accent-[#355f9e]" value={settings.header[key]} min={min} max={max} disabled={!(settings.header.path || settings.invitation.path) || conflict} onChange={(event) => { update("header", { [key]: Number(event.target.value) }); setView("hub"); }} /></label>)}</div>}
            </section>)}
          </fieldset>
        </form>
        <section id="artwork-preview-panel" className={`min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 ${mobileView === "preview" ? "block" : "hidden lg:block"}`} aria-label="Design and artwork preview">
          <h2 className="font-serif text-2xl">A guest’s-eye view</h2><p className="mt-2 text-sm leading-6 text-[#202523]/60">{dirty ? "Includes unsaved design changes" : "Private draft preview"} · Not the live event. Check both sizes; save before opening the full guest preview.</p>
          <div className="mb-4 mt-3 flex flex-wrap gap-2" role="group" aria-label="Preview screen"><button type="button" className={button} aria-pressed={view === "invitation"} onClick={() => setView("invitation")}>Invitation</button><button type="button" className={button} aria-pressed={view === "hub"} onClick={() => setView("hub")}>Event Hub</button></div>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Preview size">{(["phone", "desktop"] as const).map((size) => <button key={size} type="button" className={button} aria-pressed={device === size} onClick={() => setDevice(size)}>{size === "phone" ? "Phone" : "Desktop"}</button>)}</div>
          <PreviewFrame device={device} label="Private draft"><EventDraftPreview draft={draft} artwork={settings} view={view} fullPage={device === "desktop"} /></PreviewFrame>
          <div className="mt-4 flex flex-wrap gap-3"><Link className={button} href={`/admin/events/${draft.id}/preview`} onClick={leave}>Preview saved draft</Link></div>
        </section>
      </div>
    </div>
    <DraftEditorActionBar formId="event-artwork-form" saveLabel="Save artwork" saveAccessibleLabel="Save draft design & artwork" saveAllowed={dirty}
      pendingLabel={busy?.startsWith("Uploading") ? "Uploading…" : "Saving artwork…"} pending={Boolean(busy)} dirty={dirty} conflict={conflict}
      reviewReady reviewHref={`/admin/events/${draft.id}/publish`} error={error} reopenHref={`/admin/events/${draft.id}/artwork`} reopenLabel="Reopen saved artwork" onLeave={leave}
      status={busy ?? (conflict ? "Reopen the latest artwork before saving or reviewing." : message ?? (dirty ? "You have unsaved artwork changes. Save before reviewing." : "Saved draft artwork stays private until you explicitly publish it. Artwork is optional."))} />
  </main>;
}
