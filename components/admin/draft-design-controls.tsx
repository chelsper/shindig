"use client";
import { EVENT_DESIGNS } from "../../lib/event-design";
import { defaultArtworkCrop } from "../../lib/design-artwork";
import type { DraftArtwork } from "../../lib/event-draft-artwork";
import { EventAppearanceControls } from "./event-appearance-controls";

export function DraftDesignControls({ settings, onChange, disabled }: {
  settings: DraftArtwork; onChange: (next: DraftArtwork) => void; disabled: boolean;
}) {
  const design = settings.design;
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
  </section>;
}
