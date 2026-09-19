"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { saveInvitation } from "../../app/admin/invitation/actions";
import { DEFAULT_INVITATION_SETTINGS, fromEventLocalInput, resolveEventConfiguration, toEventLocalInput, type InvitationRecord } from "../../lib/invitation-settings";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";

const panel = "rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-6";
const input = "field-input min-w-0 w-full";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/65 px-4 text-xs font-bold text-[#214e91] disabled:opacity-40";

export function InvitationEditor({ initialRecord, uploadConfigured }: { initialRecord: InvitationRecord; uploadConfigured: boolean }) {
  const [settings, setSettings] = useState(initialRecord.settings);
  const [revision, setRevision] = useState(initialRecord.revision);
  const [publishedAddress, setPublishedAddress] = useState(initialRecord.settings.address);
  const [startsAtLocal, setStartsAtLocal] = useState(toEventLocalInput(settings.startsAtUtc));
  const [endsAtLocal, setEndsAtLocal] = useState(toEventLocalInput(settings.endsAtUtc));
  const [latitude, setLatitude] = useState(String(settings.coordinates.latitude));
  const [longitude, setLongitude] = useState(String(settings.coordinates.longitude));
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewStart = fromEventLocalInput(startsAtLocal);
  const preview = resolveEventConfiguration({ ...settings, startsAtUtc: previewStart ?? settings.startsAtUtc });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changed() { setDirty(true); setStatus(null); setError(null); }

  async function replaceImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy.current) return;
    changed();
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
    if (!extensions[file.type] || file.size > 10 * 1024 * 1024) { setError("Choose a JPG, PNG, WebP, or AVIF image smaller than 10 MB."); return; }
    busy.current = true;
    setUploading(true); setProgress(0);
    try {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width, height = bitmap.height;
      bitmap.close();
      if (width < 1 || height < 1 || width > 12000 || height > 12000) throw new Error("Image dimensions unsupported");
      const blob = await upload(`invitation/${OYSTER_ROAST_EVENT.slug}/artwork.${extensions[file.type]}`, file, {
        access: "public", handleUploadUrl: "/api/admin/invitation/upload", multipart: true,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      setSettings((value) => ({ ...value, invitation: { ...value.invitation, imageUrl: blob.url, imageWidth: width, imageHeight: height } }));
      setStatus("Artwork uploaded to your draft. Add an artwork description, then save to publish.");
    } catch { setError("We couldn’t upload that image. Try a JPG or PNG under 10 MB, no larger than 12,000 pixels per side."); }
    finally { busy.current = false; setUploading(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setStatus(null); setError(null);
    startTransition(async () => {
      try {
        const result = await saveInvitation({
          revision, startsAtLocal, endsAtLocal, locationConfirmed,
          settings: { ...settings, coordinates: { latitude: latitude.trim() ? Number(latitude) : NaN, longitude: longitude.trim() ? Number(longitude) : NaN } },
        });
        if (!result.ok) { setError(result.message); return; }
        setSettings(result.settings); setRevision(result.revision);
        setPublishedAddress(result.settings.address); setLocationConfirmed(false);
        setDirty(false); setStatus("Invitation published! The invitation, Event Hub, and new calendar downloads now use these details.");
      } catch { setError("We couldn’t confirm the save. Please try again. If changes were saved, we’ll ask you to reload before overwriting them."); }
      finally { busy.current = false; }
    });
  }

  const disabled = pending || uploading;
  const textField = (key: "title" | "venue" | "address" | "cityLabel", label: string, max: number) => <label className="field-label min-w-0">{label}
    <input className={input} name={key} value={settings[key]} maxLength={max} required onChange={(e) => {
      setSettings({ ...settings, [key]: e.target.value });
      if (key === "address") setLocationConfirmed(false);
    }} />
  </label>;

  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5">
        <Link href="/admin" className="font-serif text-2xl">Shindig</Link>
        <Link href="/admin" className={secondary} onClick={(e) => { if (dirty && !window.confirm("Leave without saving your invitation changes?")) e.preventDefault(); }}>Back to dashboard</Link>
      </header>
      <section className="py-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Host Dashboard</p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">Your invitation</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#202523]/65">Edit the page guests see before they RSVP. Nothing changes publicly until you save. Your guest responses and private update links stay exactly as they are.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a className={secondary} href="/" target="_blank" rel="noreferrer">View live invitation ↗</a>
          <button className={secondary} type="button" onClick={() => setPreviewOpen(!previewOpen)} aria-expanded={previewOpen} aria-controls="invitation-preview">{previewOpen ? "Hide" : "Show"} draft preview</button>
        </div>
      </section>

      <div className={`grid items-start gap-6 ${previewOpen ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "max-w-2xl"}`}>
        <form onSubmit={save} onChange={changed} className="min-w-0 space-y-5 pb-5">
          <fieldset disabled={disabled} className="min-w-0 space-y-5">
            <section className={panel}>
              <h2 className="mb-5 font-serif text-2xl">Words to welcome them</h2>
              <div className="space-y-4">
                {textField("title", "Event title", 180)}
                <label className="field-label">Description<textarea name="description" className={`${input} min-h-32 resize-y py-3 normal-case`} rows={4} required maxLength={2000} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} /></label>
                <label className="field-label">Invitation label<input className={input} name="eyebrow" required maxLength={60} value={settings.invitation.eyebrow} onChange={(e) => setSettings({ ...settings, invitation: { ...settings.invitation, eyebrow: e.target.value } })} /></label>
                <label className="field-label">RSVP heading<input className={input} name="rsvpHeading" required maxLength={120} value={settings.invitation.rsvpHeading} onChange={(e) => setSettings({ ...settings, invitation: { ...settings.invitation, rsvpHeading: e.target.value } })} /></label>
              </div>
            </section>
            <section className={panel}>
              <h2 className="font-serif text-2xl">When & where</h2>
              <p className="mb-5 mt-2 text-xs leading-5 text-[#202523]/60">Shared with the Event Hub, directions, weather, and calendar links. All times are in America/New_York, including daylight saving time.</p>
              <div className="space-y-4">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="field-label min-w-0">Starts<input className={`${input} max-w-full`} type="datetime-local" min="2000-01-01T00:00" max="2099-12-31T23:59" name="startsAtLocal" required value={startsAtLocal} onInput={(e) => { changed(); setStartsAtLocal(e.currentTarget.value); }} onChange={(e) => setStartsAtLocal(e.target.value)} /></label>
                  <label className="field-label min-w-0">Ends (for calendars)<input className={`${input} max-w-full`} type="datetime-local" min="2000-01-01T00:00" max="2099-12-31T23:59" name="endsAtLocal" required value={endsAtLocal} onInput={(e) => { changed(); setEndsAtLocal(e.currentTarget.value); }} onChange={(e) => setEndsAtLocal(e.target.value)} /></label>
                </div>
                <label className="field-label">Time note (optional)<input name="timeNote" className={input} maxLength={120} value={settings.invitation.timeNote} onChange={(e) => setSettings({ ...settings, invitation: { ...settings.invitation, timeNote: e.target.value } })} /></label>
                {textField("venue", "Venue name", 120)}
                {textField("address", "Street address", 300)}
                {textField("cityLabel", "City label", 100)}
                <details open={settings.address.trim() !== publishedAddress ? true : undefined}>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm text-[#355f9e]">Weather coordinates</summary>
                  <p className="mb-3 text-xs leading-5 text-[#202523]/60">Keep these at the event location. If you change the address, update or confirm the coordinates too. We never use a guest’s device location.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="field-label min-w-0">Latitude<input className={input} type="number" step="any" min={-90} max={90} name="latitude" value={latitude} required onChange={(e) => { setLatitude(e.target.value); setLocationConfirmed(false); }} /></label>
                    <label className="field-label min-w-0">Longitude<input className={input} type="number" step="any" min={-180} max={180} name="longitude" value={longitude} required onChange={(e) => { setLongitude(e.target.value); setLocationConfirmed(false); }} /></label>
                  </div>
                  {settings.address.trim() !== publishedAddress && <label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" checked={locationConfirmed} required onChange={(e) => setLocationConfirmed(e.target.checked)} />These coordinates match the new address.</label>}
                </details>
              </div>
            </section>
            <section className={panel}>
              <h2 className="font-serif text-2xl">Invitation artwork</h2>
              <p className="mb-4 mt-2 text-xs leading-5 text-[#202523]/60">Shown in full, without cropping. This does not change the Event Hub header. Text printed inside an image won’t change when you edit the fields above.</p>
              <Image src={settings.invitation.imageUrl} alt={settings.invitation.imageAlt} width={settings.invitation.imageWidth} height={settings.invitation.imageHeight} className="mx-auto mb-4 h-auto max-h-72 w-auto max-w-full rounded-xl" sizes="300px" />
              {uploadConfigured ? <label className="field-label">Replace artwork<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className={`${input} py-3 text-xs file:mr-2 file:rounded-full file:border-0 file:bg-[#e9f2f8] file:p-2`} onChange={replaceImage} /></label> : <p className="rounded-xl bg-[#fff4d8] p-3 text-xs leading-5 text-[#765319]">Image uploads need a connected Vercel Blob store. You can edit all wording and event details now.</p>}
              <p className="mt-2 text-xs text-[#202523]/55">JPG, PNG, WebP or AVIF · up to 10 MB.</p>
              <label className="field-label mt-4">Artwork description<input className={input} name="imageAlt" required maxLength={180} value={settings.invitation.imageAlt} onChange={(e) => setSettings({ ...settings, invitation: { ...settings.invitation, imageAlt: e.target.value } })} /><span className="text-xs font-normal normal-case tracking-normal text-[#202523]/55">Describe the image for guests using screen readers.</span></label>
              <button className="mt-3 min-h-11 text-xs font-bold text-[#355f9e] underline" type="button" onClick={() => {
                changed(); const original = DEFAULT_INVITATION_SETTINGS.invitation;
                setSettings({ ...settings, invitation: { ...settings.invitation, imageUrl: original.imageUrl, imageAlt: original.imageAlt, imageWidth: original.imageWidth, imageHeight: original.imageHeight } });
              }}>Use original artwork</button>
            </section>
          </fieldset>
          <div className="sticky bottom-3 z-10 rounded-2xl border border-[#202523]/15 bg-[#fffaf1] p-4 shadow-[0_8px_30px_rgb(32_37_35_/_0.12)]">
            {error && <p role="alert" className="mb-3 text-sm leading-5 text-[#843528]">{error}</p>}
            {status && <p role="status" className="mb-3 text-sm leading-5 text-[#285630]">{status}</p>}
            {uploading && <p role="status" className="mb-3 text-sm">Uploading artwork… {progress}%</p>}
            <button type="submit" className="primary-button w-full" disabled={disabled || !dirty}>{pending ? "Publishing…" : "Save & publish invitation"}</button>
            <p className="mt-2 text-center text-xs leading-5 text-[#202523]/55">{dirty ? "You have unpublished changes." : "Your published invitation is up to date."}</p>
          </div>
          <p className="px-1 text-xs leading-5 text-[#202523]/55">Already-downloaded calendar events won’t update automatically. If plans change, let guests know separately.</p>
        </form>

        {previewOpen && <aside id="invitation-preview" aria-label="Invitation draft preview" className={`${panel} order-first min-w-0 break-words lg:sticky lg:top-6 lg:order-last`}>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#355f9e]">Draft preview · not yet published</p>
          <Image src={settings.invitation.imageUrl} alt={settings.invitation.imageAlt} width={settings.invitation.imageWidth} height={settings.invitation.imageHeight} className="h-auto w-full rounded-2xl" sizes="(min-width: 1024px) 420px, 100vw" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#355f9e]">{settings.invitation.eyebrow}</p>
          <h2 className="mt-2 font-serif text-4xl leading-tight tracking-[-0.04em]">{settings.title}</h2>
          <div className="my-4 space-y-2 border-y border-[#202523]/15 py-4 text-sm">
            <p>{previewStart ? preview.dateLabel : "Choose a valid start date"}<br />{previewStart ? preview.timeLabel : ""} {settings.invitation.timeNote}</p>
            <p>{settings.venue}<br />{settings.address}</p>
          </div>
          <p className="whitespace-pre-line text-sm leading-6 text-[#202523]/70">{settings.description}</p>
          <div className="mt-5 rounded-2xl bg-white/65 p-4"><p className="text-xs uppercase tracking-widest text-[#355f9e]">Kindly reply</p><p className="mt-2 font-serif text-2xl">{settings.invitation.rsvpHeading}</p><p className="mt-2 text-xs text-[#202523]/55">Your existing RSVP form stays unchanged.</p></div>
        </aside>}
      </div>
    </div>
  </main>;
}
