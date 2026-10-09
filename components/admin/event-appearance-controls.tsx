"use client";
import { EVENT_PALETTES, EVENT_TYPOGRAPHY, type EventTypographyId } from "../../lib/event-design";
import { appearanceChoices, resolveEventAppearance, type EventAppearance } from "../../lib/event-appearance";

export function EventAppearanceControls({ appearance, onChange, disabled }: {
  appearance: EventAppearance; onChange: (appearance: EventAppearance) => void; disabled: boolean;
}) {
  const choices = appearanceChoices(appearance), design = resolveEventAppearance(appearance);
  const customized = ["palette", "typography", "titleWeight", "titleStyle"].some((key) => key in appearance);
  function change(patch: Partial<EventAppearance>) { if (!disabled) onChange({ ...appearance, ...patch }); }
  return <fieldset disabled={disabled} className="mt-6 min-w-0 border-t border-[#202523]/10 pt-5">
    <legend className="px-1 text-xs font-semibold">Colors &amp; type</legend>
    <p id="appearance-help" className="mb-4 text-xs leading-5 text-[#202523]/65">Applies to page text and controls on your invitation and Hub, not lettering inside uploaded artwork. Choosing another event style restores that style’s defaults.</p>
    <fieldset aria-describedby="appearance-help" className="min-w-0"><legend className="text-xs font-semibold">Color palette</legend>
      <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">{EVENT_PALETTES.map((palette) => <label key={palette.id} className="flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs leading-5" style={{ background: palette.colors.surface, color: palette.colors.ink, borderColor: choices.palette === palette.id ? palette.colors.accent : palette.colors.rule }}>
        <input type="radio" name="event-palette" value={palette.id} checked={choices.palette === palette.id} onChange={() => change({ palette: palette.id })} className="shrink-0" style={{ accentColor: palette.colors.accent }} />
        <span className="min-w-0 flex-1">{palette.name}</span><span aria-hidden="true" className="size-5 shrink-0 rounded-full" style={{ background: palette.colors.button }} />
      </label>)}</div>
    </fieldset>
    <label className="mt-5 block text-xs font-semibold">Font pairing
      <select className="mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-[#202523]/20 bg-white px-3 text-sm font-normal" value={choices.typography} onChange={(event) => change({ typography: event.target.value as EventTypographyId })}>
        {EVENT_TYPOGRAPHY.map((font) => <option key={font.id} value={font.id}>{font.name} — {font.description}</option>)}
      </select>
    </label>
    <fieldset className="mt-5 min-w-0"><legend className="text-xs font-semibold">Event title</legend>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {([ ["regular", "Regular"], ["bold", "Bold"] ] as const).map(([value, label]) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#202523]/20 bg-white px-3 text-sm">
          <input type="radio" name="event-title-weight" value={value} checked={choices.titleWeight === value} onChange={() => change({ titleWeight: value })} /><span className={value === "bold" ? "font-bold" : ""}>{label}</span>
        </label>)}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm"><input type="checkbox" checked={choices.titleStyle === "italic"} onChange={(event) => change({ titleStyle: event.target.checked ? "italic" : "normal" })} /><span className="italic">Italic title</span></label>
      </div>
    </fieldset>
    <div aria-label="Typography and palette sample" className="mt-4 overflow-hidden rounded-xl border p-4" style={{ background: design.colors.surface, color: design.colors.ink, borderColor: design.colors.rule }}>
      <p className="break-words text-3xl leading-tight" style={{ fontFamily: design.headingFont, fontStyle: choices.titleStyle, fontWeight: choices.titleWeight === "bold" ? 700 : 400 }}>You’re invited.</p>
      <p className="mt-2 text-sm leading-6" style={{ color: design.colors.muted, fontFamily: design.bodyFont }}>Good people. A little time together.</p>
    </div>
    <button type="button" disabled={!customized || disabled} className="mt-2 min-h-11 text-xs font-semibold text-[#355f9e] underline underline-offset-4 disabled:opacity-50" onClick={() => { if (!disabled) onChange({ style: appearance.style, invitationCrop: appearance.invitationCrop }); }}>Reset colors &amp; type to {design.name}</button>
    <p className="text-xs leading-5 text-[#202523]/65">Reset keeps your artwork and crops. Preview changes now; guests see them only after publishing.</p>
  </fieldset>;
}
