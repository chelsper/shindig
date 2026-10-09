"use client";
import { EVENT_DESIGNS } from "../../lib/event-design";
import { artworkAspect, defaultArtworkCrop, type ArtworkCrop as Crop } from "../../lib/design-artwork";
import { draftImageUrl, type DraftArtwork } from "../../lib/event-draft-artwork";
import type { DesignPreviewDevice, DesignPreviewPage } from "../../lib/design-preview";
import { ArtworkCrop } from "../design-studio/artwork-crop";
import { EventAppearanceControls } from "./event-appearance-controls";

export function DraftDesignControls({ id, settings, onChange, view, onViewChange, device, disabled }: {
  id: string; settings: DraftArtwork; onChange: (next: DraftArtwork) => void;
  view: DesignPreviewPage; onViewChange: (view: DesignPreviewPage) => void;
  device: DesignPreviewDevice; disabled: boolean;
}) {
  const design = settings.design;
  const image = view === "hub" && settings.header.path ? settings.header : settings.invitation;
  const crop = view === "invitation" ? design?.invitationCrop ?? defaultArtworkCrop() : { x: settings.header.focalX, y: settings.header.focalY, zoom: settings.header.zoomPercent };
  function updateCrop(next: Crop) {
    if (!design || disabled) return;
    onChange(view === "invitation" ? { ...settings, design: { ...design, invitationCrop: next } } : { ...settings, header: { ...settings.header, focalX: next.x, focalY: next.y, zoomPercent: next.zoom } });
  }
  return <section className="rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-6">
    <h2 className="font-serif text-2xl">Make it yours</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">Choose a look for this event’s invitation and Hub. Save it privately, then review and publish when you’re ready.</p>
    <fieldset disabled={disabled} className="mt-4 min-w-0"><legend className="text-xs font-semibold">Event style</legend>
      <div className="mt-2 space-y-2">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[#202523]/15 px-3 py-2 text-sm"><input type="radio" name="event-style" value="original" checked={!design} onChange={() => { const next = { ...settings, header: { ...settings.header, zoomPercent: Math.min(200, settings.header.zoomPercent) } }; delete next.design; onChange(next); }} /><span>Original layout <span className="block text-xs text-[#202523]/60">Uncropped invitation; the existing Shindig appearance.</span></span></label>
        {EVENT_DESIGNS.map((style) => <label key={style.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[#202523]/15 px-3 py-2 text-sm" style={{ background: style.colors.surface, color: style.colors.ink, borderColor: design?.style === style.id ? style.colors.accent : style.colors.rule }}>
          <input type="radio" name="event-style" value={style.id} checked={design?.style === style.id} onChange={() => onChange({ ...settings, design: { style: style.id, invitationCrop: design?.invitationCrop ?? defaultArtworkCrop() } })} />
          <span><strong>{style.name}</strong><span className="block text-xs" style={{ color: style.colors.muted }}>{style.description}</span></span>
          <span aria-hidden="true" className="ml-auto size-6 shrink-0 rounded-full border" style={{ background: style.colors.button, borderColor: style.colors.rule }} />
        </label>)}
      </div>
    </fieldset>
    {design ? <EventAppearanceControls appearance={design} disabled={disabled} onChange={(next) => onChange({ ...settings, design: next })} /> : <p className="mt-3 text-xs leading-5 text-[#202523]/65">Choose Classic, Coastal or After Dark to customize colors and type. Original layout stays exactly as it is.</p>}
    {design && <fieldset disabled={disabled} className="mt-6 min-w-0"><legend className="text-xs font-semibold">Frame your artwork</legend>
      <div className="my-3 flex flex-wrap gap-2">{([ ["invitation", "Invitation crop"], ["hub", "Hub crop"] ] as const).map(([value, label]) => <button key={value} type="button" className="min-h-11 rounded-full border border-[#355f9e]/25 px-4 text-xs font-semibold text-[#214e91] aria-pressed:bg-[#e9f2f8]" aria-pressed={view === value} onClick={() => onViewChange(value)}>{label}</button>)}</div>
      {image.path ? <>
        <p className="mb-3 text-xs leading-5 text-[#202523]/65">{device === "phone" ? "Phone" : "Desktop"} framing. Drag or use the sliders. Invitation and Hub crops are saved separately; the Hub shares one focal point across both sizes.</p>
        <div className="mx-auto max-w-sm overflow-hidden rounded-xl">
          <ArtworkCrop key={`${image.path}:${view}:${device}`} artwork={{ url: draftImageUrl(id, image.path), name: image.alt, width: 1, height: 1 }} crop={crop} aspect={artworkAspect(view, device)} onChange={disabled ? undefined : updateCrop} />
        </div>
        <div className="mt-4 space-y-2">{([ ["zoom", "Zoom", 100, 250], ["x", "Horizontal position", 0, 100], ["y", "Vertical position", 0, 100] ] as const).map(([key, label, min, max]) => <label key={key} className="block text-xs font-semibold">
          <span className="flex justify-between">{label}<output>{crop[key]}%</output></span><input aria-label={`${view === "invitation" ? "Invitation" : "Hub"} ${label.toLowerCase()}`} type="range" className="min-h-11 w-full accent-[#355f9e]" value={crop[key]} min={min} max={max} onChange={(event) => updateCrop({ ...crop, [key]: Number(event.target.value) })} />
        </label>)}</div>
        <button type="button" onClick={() => updateCrop(defaultArtworkCrop())} className="min-h-11 text-xs text-[#355f9e] underline">Reset {view === "invitation" ? "invitation" : "Hub"} crop</button>
      </> : <p className="text-sm leading-6 text-[#202523]/65">Upload invitation artwork below to frame it here. A separate Hub image is optional.</p>}
    </fieldset>}
  </section>;
}
