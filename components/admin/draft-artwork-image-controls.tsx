"use client";

import { useRef, type ChangeEvent } from "react";
import { changeDraftArtworkCrop, draftArtworkCrop, DRAFT_IMAGE_TYPES, type DraftArtwork, type DraftImageKind } from "../../lib/event-draft-artwork";
import { defaultArtworkCrop } from "../../lib/design-artwork";
import type { DesignPreviewDevice } from "../../lib/design-preview";
import { DraftArtworkFraming } from "./draft-artwork-framing";

const action = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 px-4 py-2 text-xs font-semibold text-[#214e91] disabled:cursor-not-allowed disabled:opacity-40";

export function DraftArtworkImageControls({ id, settings, kind, active, device, disabled, uploadConfigured, onUpload, onChange, onDeviceChange, onReposition }: {
  id: string; settings: DraftArtwork; kind: DraftImageKind; active: boolean; device: DesignPreviewDevice; disabled: boolean; uploadConfigured: boolean;
  onUpload: (kind: DraftImageKind, event: ChangeEvent<HTMLInputElement>) => void;
  onChange: (settings: DraftArtwork) => void; onDeviceChange: (device: DesignPreviewDevice) => void; onReposition: (kind: DraftImageKind) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const header = kind === "header";
  const hasImage = Boolean(settings[kind].path || (header && settings.invitation.path));
  const canFrame = header || Boolean(settings.design);
  const name = header ? "Event Hub header" : "invitation image";
  function change(next: DraftArtwork) { if (!disabled) onChange(next); }
  function reset() {
    if (disabled || !hasImage || !canFrame) return;
    change(changeDraftArtworkCrop(settings, kind, device, defaultArtworkCrop()));
  }
  return <section id={`artwork-${kind}-controls`} aria-labelledby={`artwork-${kind}-heading`} hidden={!active} className="scroll-mt-24 rounded-[1.5rem] border border-[#355f9e]/25 bg-[#fffaf1]/90 p-5 sm:p-6">
    <h2 id={`artwork-${kind}-heading`} tabIndex={-1} className="scroll-mt-24 font-serif text-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]">Editing {name}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">{header
      ? settings.header.path ? "A separate image for the Event Hub. Changes here won’t alter your invitation." : "Using your invitation artwork with its own header crop. Replace it to choose a separate header; your invitation will stay as it is."
      : settings.design ? "Frame your invitation here. Its crop is separate from the Event Hub header." : "The original layout shows your invitation in full. The Event Hub header can be repositioned separately."}</p>
    {canFrame && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`${header ? "Header" : "Invitation"} framing size`}>
      {(["phone", "desktop"] as const).map(size => <button key={size} type="button" className={`${action} aria-pressed:bg-[#e9f2f8] aria-pressed:border-[#355f9e]`} aria-pressed={device === size} disabled={disabled} onClick={() => { if (!disabled) onDeviceChange(size); }}>{size === "phone" ? "Phone crop" : "Desktop crop"}</button>)}
    </div>}
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`${name} actions`}>
      <input id={`artwork-${kind}-upload`} ref={input} type="file" hidden accept={DRAFT_IMAGE_TYPES.join(",")} disabled={disabled || !uploadConfigured} onChange={event => onUpload(kind, event)} />
      <button type="button" className={`${action} bg-[#e9f2f8]`} aria-controls={`artwork-${kind}-upload`} aria-label={`${hasImage ? "Replace" : "Choose"} ${name}`} disabled={disabled || !uploadConfigured} onClick={() => { if (!disabled && uploadConfigured) input.current?.click(); }}>{hasImage ? "Replace image" : "Choose image"}</button>
      {canFrame && <>
        <button type="button" className={action} aria-controls={`artwork-${kind}-framing`} disabled={disabled || !hasImage} onClick={() => { if (!disabled && hasImage) onReposition(kind); }}>Reposition</button>
        <button type="button" className={action} aria-label={`Reset ${device} ${header ? "header" : "invitation"} crop`} disabled={disabled || !hasImage} onClick={reset}>Reset {device} crop</button>
      </>}
    </div>
    {canFrame && hasImage && <button type="button" disabled={disabled} className="mt-2 min-h-11 text-xs text-[#355f9e] underline underline-offset-4 disabled:opacity-40" onClick={() => change(changeDraftArtworkCrop(settings, kind, device, draftArtworkCrop(settings, kind, device === "phone" ? "desktop" : "phone")))}>Copy {device === "phone" ? "desktop" : "phone"} crop to {device}</button>}
    <p className="mt-2 text-xs leading-5 text-[#202523]/55">JPG, PNG, WebP or AVIF · Up to 4 MB. Replacing or resetting only changes this draft.</p>
    {settings[kind].path && <>
      <label className="field-label mt-4">{header ? "Header image description" : "Invitation image description"}<input className="field-input" value={settings[kind].alt} onChange={event => change({ ...settings, [kind]: { ...settings[kind], alt: event.target.value } })} maxLength={180} required disabled={disabled} /></label>
      <button className="mt-2 min-h-11 text-xs text-[#355f9e] underline underline-offset-4 disabled:opacity-40" disabled={disabled} type="button" onClick={() => change({ ...settings, [kind]: { ...settings[kind], path: null, alt: "" } })}>{header ? "Use invitation artwork instead" : "Remove from draft"}</button>
    </>}
    <DraftArtworkFraming id={id} settings={settings} kind={kind} device={device} disabled={disabled} showReset={false} onChange={change} />
  </section>;
}
