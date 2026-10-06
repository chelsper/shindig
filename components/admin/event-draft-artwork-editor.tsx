"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { EventDraft } from "../../lib/event-drafts";
import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_TYPES, isDraftImagePath, type DraftArtwork, type DraftArtworkRecord, type DraftImageKind } from "../../lib/event-draft-artwork";
import { saveDraftArtwork } from "../../app/admin/events/[id]/artwork/actions";
import { EventDraftPreview } from "./event-draft-preview";

const panel = "rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-6";
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/65 px-4 text-xs font-bold text-[#214e91] disabled:opacity-40";

export function EventDraftArtworkEditor({ draft, initial, uploadConfigured }: { draft: EventDraft; initial: DraftArtworkRecord; uploadConfigured: boolean }) {
  const [settings, setSettings] = useState(initial.settings);
  const [revision, setRevision] = useState(initial.revision);
  const [view, setView] = useState<"invitation" | "hub">("invitation");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (busy || (dirty && !window.confirm("Leave without saving your artwork changes?"))) event.preventDefault();
  }
  function update(kind: DraftImageKind, patch: Partial<DraftArtwork["header"]>) {
    setSettings((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
    setDirty(true); setMessage(null); setError(null);
  }
  async function upload(kind: DraftImageKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || lock.current || !uploadConfigured) return;
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
    event.preventDefault(); if (lock.current || conflict) return;
    lock.current = true; setBusy("Saving artwork…"); setError(null); setMessage(null);
    try {
      const result = await saveDraftArtwork({ id: draft.id, revision, settings });
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setRevision(result.revision); setDirty(false); setMessage("Artwork saved to your private draft. Nothing has been published.");
    } catch { setError("We couldn’t confirm the save. Your changes are still here; please try again."); }
    finally { lock.current = false; setBusy(null); }
  }
  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5"><Link href="/admin/events" className="font-serif text-2xl" onClick={leave}>Shindig</Link><Link href={`/admin/events/${draft.id}`} className={button} onClick={leave}>Back to event basics</Link></header>
      <section className="py-7"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Event setup · Private draft</p><h1 className="mt-2 font-serif text-4xl sm:text-5xl">Set the scene</h1><p className="mt-3 break-words text-sm leading-6 text-[#202523]/65">Artwork for {draft.title}. Give the invitation its own look, then frame a header for the Event Hub.</p></section>
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,390px)]">
        <form onSubmit={save} className="min-w-0">
          <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-5">
            {!uploadConfigured && <p role="status" className="rounded-2xl bg-[#fff4d8] p-4 text-sm leading-6 text-[#765319]">Uploads need a private Vercel Blob store. Add EVENT_DRAFT_BLOB_READ_WRITE_TOKEN to the server environment. Draft artwork is never stored in the live event’s public image store.</p>}
            {(["invitation", "header"] as const).map((kind) => <section key={kind} className={panel}>
              <h2 className="font-serif text-2xl">{kind === "invitation" ? "Invitation artwork" : "Event Hub header"}</h2>
              <p className="mt-2 text-sm leading-6 text-[#202523]/60">{kind === "invitation" ? "Shown in full, without cropping." : "Upload a separate image, or use the invitation artwork. The framing below only affects the header."}</p>
              <label className="field-label mt-4">{kind === "invitation" ? "Upload invitation artwork" : "Upload a separate header"}<input type="file" accept={DRAFT_IMAGE_TYPES.join(",")} disabled={!uploadConfigured || conflict} onChange={(event) => void upload(kind, event)} className="field-input max-w-full cursor-pointer py-3 text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#e9f2f8] file:px-3 file:py-2 file:text-xs" /></label>
              <p className="mt-2 text-xs leading-5 text-[#202523]/55">JPG, PNG, WebP or AVIF · Up to 4 MB</p>
              {settings[kind].path && <><label className="field-label mt-4">{kind === "invitation" ? "Invitation image description" : "Header image description"}<input className="field-input" value={settings[kind].alt} onChange={(event) => update(kind, { alt: event.target.value })} maxLength={180} required /></label><button className="mt-3 min-h-11 text-xs text-[#355f9e] underline underline-offset-4" type="button" onClick={() => update(kind, { path: null, alt: "" })}>{kind === "invitation" ? "Remove from draft" : "Use invitation artwork instead"}</button></>}
              {kind === "header" && <div className="mt-5 space-y-4">{([ ["focalX", "Horizontal focus", 0, 100], ["focalY", "Vertical focus", 0, 100], ["zoomPercent", "Zoom", 100, 200] ] as const).map(([key, label, min, max]) => <label key={key} className="block text-xs font-semibold text-[#202523]/70">{label} <span className="float-right text-[#355f9e]">{settings.header[key]}%</span><input type="range" className="mt-2 min-h-8 w-full accent-[#355f9e]" value={settings.header[key]} min={min} max={max} disabled={!(settings.header.path || settings.invitation.path) || conflict} onChange={(event) => { update("header", { [key]: Number(event.target.value) }); setView("hub"); }} /></label>)}</div>}
            </section>)}
            <section className={panel}>
              {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-900">{error}</p>}
              {message && <p role="status" className="mb-4 rounded-xl bg-[#e4eee1] p-3 text-sm leading-6 text-[#285630]">{message}</p>}
              {conflict && <a href={`/admin/events/${draft.id}/artwork`} className={`${button} mb-3`} onClick={leave}>Reopen saved artwork</a>}
              <button className="primary-button w-full" type="submit" disabled={Boolean(busy) || !dirty || conflict}>{busy ?? "Save draft artwork"}</button>
              <p className="mt-3 text-center text-xs leading-5 text-[#202523]/55">{dirty ? "You have unsaved artwork changes." : "Private to the host. No guest link or publishing yet."}</p>
            </section>
          </fieldset>
        </form>
        <section className="min-w-0 self-start md:sticky md:top-6" aria-label="Mobile artwork preview">
          <h2 className="font-serif text-2xl">A guest’s-eye view</h2><p className="mt-2 text-sm leading-6 text-[#202523]/60">Phone-width preview of your unsaved artwork and saved event basics.</p>
          <div className="mb-4 mt-3 flex flex-wrap gap-2" role="group" aria-label="Preview screen"><button type="button" className={button} aria-pressed={view === "invitation"} onClick={() => setView("invitation")}>Invitation</button><button type="button" className={button} aria-pressed={view === "hub"} onClick={() => setView("hub")}>Event Hub</button></div>
          <EventDraftPreview draft={draft} artwork={settings} view={view} />
        </section>
      </div>
    </div>
  </main>;
}
