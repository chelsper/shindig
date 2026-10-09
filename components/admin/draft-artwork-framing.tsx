"use client";

import { artworkAspect, defaultArtworkCrop, type ArtworkCrop as Crop } from "../../lib/design-artwork";
import type { DesignPreviewDevice } from "../../lib/design-preview";
import { draftImageUrl, type DraftArtwork, type DraftImageKind } from "../../lib/event-draft-artwork";
import { ArtworkCrop } from "../design-studio/artwork-crop";

export function DraftArtworkFraming({ id, settings, kind, device, disabled, onChange, onDeviceChange }: {
  id: string; settings: DraftArtwork; kind: DraftImageKind; device: DesignPreviewDevice; disabled: boolean;
  onChange: (next: DraftArtwork) => void; onDeviceChange: (device: DesignPreviewDevice) => void;
}) {
  const header = kind === "header";
  const image = header && settings.header.path ? settings.header : settings.invitation;
  const label = header ? "Header" : "Invitation";
  const crop = header
    ? { x: settings.header.focalX, y: settings.header.focalY, zoom: settings.header.zoomPercent }
    : settings.design?.invitationCrop ?? defaultArtworkCrop();
  const maxZoom = settings.design ? 250 : 200;
  const aspect = header && !settings.design && device === "desktop" ? 16 / 6 : artworkAspect(header ? "hub" : "invitation", device);
  function update(next: Crop) {
    if (disabled || !image.path) return;
    if (header) onChange({ ...settings, header: { ...settings.header, focalX: next.x, focalY: next.y, zoomPercent: next.zoom } });
    else if (settings.design) onChange({ ...settings, design: { ...settings.design, invitationCrop: next } });
  }
  // The original invitation is deliberately shown in full, without cropping.
  if (!header && !settings.design) return null;
  return <fieldset disabled={disabled} className="mt-5 min-w-0 border-t border-[#202523]/10 pt-4">
    <legend className="pr-2 text-sm font-semibold">Adjust {header ? "header" : "invitation"} image</legend>
    {image.path ? <>
      <p className="mb-3 text-xs leading-5 text-[#202523]/65">{header
        ? `${settings.header.path ? "This header" : "Using your invitation artwork, this header"} has its own crop. Adjusting it won’t change the invitation. Check both sizes; they share one saved crop.`
        : "Drag or use the sliders to frame your invitation. These adjustments won’t change the Event Hub header."}</p>
      {header && <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Header framing size">
        {(["phone", "desktop"] as const).map(size => <button key={size} type="button" aria-pressed={device === size} onClick={() => { if (!disabled) onDeviceChange(size); }} className="min-h-11 rounded-full border border-[#355f9e]/25 px-4 text-xs font-semibold text-[#214e91] aria-pressed:bg-[#e9f2f8]">{size === "phone" ? "Phone header" : "Desktop header"}</button>)}
      </div>}
      <div className="mx-auto max-w-sm overflow-hidden rounded-xl">
        <ArtworkCrop key={`${image.path}:${kind}:${device}`} artwork={{ url: draftImageUrl(id, image.path), name: image.alt, width: 1, height: 1 }} crop={crop} aspect={aspect} onChange={disabled ? undefined : update} />
      </div>
      <div className="mt-4 space-y-2">{([
        ["zoom", "Zoom", 100, maxZoom], ["x", "Horizontal position", 0, 100], ["y", "Vertical position", 0, 100],
      ] as const).map(([key, name, min, max]) => <label key={key} className="block text-xs font-semibold">
        <span className="flex justify-between gap-3">{name}<output>{crop[key]}%</output></span>
        <input aria-label={`${label} ${name.toLowerCase()}`} type="range" min={min} max={max} value={crop[key]} className="min-h-11 w-full accent-[#355f9e]" onChange={event => update({ ...crop, [key]: Number(event.target.value) })} />
      </label>)}</div>
      <button type="button" onClick={() => update(defaultArtworkCrop())} className="min-h-11 text-xs text-[#355f9e] underline underline-offset-4">Reset {header ? "header" : "invitation"} crop</button>
    </> : <p className="text-sm leading-6 text-[#202523]/65">{header ? "Upload a header above, or add invitation artwork to use here. Then adjust its framing." : "Upload invitation artwork above to adjust its framing."}</p>}
  </fieldset>;
}
