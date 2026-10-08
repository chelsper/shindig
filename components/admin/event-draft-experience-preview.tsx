"use client";
import { useState } from "react";
import { DRAFT_HUB_MODULES, type DraftSettings } from "../../lib/event-draft-settings";
import { HubNavigation } from "../event-hub/hub-navigation";
import { RsvpDeadlineNote } from "../rsvp/rsvp-deadline-note";

// Deliberately not the live modules/form: draft previews must never call the
// Oyster Roast's public actions, data services, or guest-interaction cookie API.
export function DraftRsvpPreview({ settings, timeZone }: { settings: DraftSettings; timeZone?: string }) {
  const [attending, setAttending] = useState(true);
  return <section className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-4" aria-label="RSVP preview">
    <p className="text-[0.6rem] font-bold uppercase tracking-widest text-[#355f9e]">Kindly reply · Preview only</p>
    <h4 className="mt-2 font-serif text-2xl">Will you join us?</h4>
    {timeZone && <RsvpDeadlineNote deadline={settings.rsvp.deadlineAtUtc} timeZone={timeZone} />}
    {settings.rsvp.capacity != null && <p className="mt-2 text-xs leading-5 text-[#202523]/60">Preview: {settings.rsvp.capacity} total guest capacity. Live availability is checked when guests reply.</p>}
    <div className="mt-4 flex gap-2" role="group" aria-label="Preview RSVP response">
      {[true, false].map((value) => <button key={String(value)} type="button" aria-pressed={attending === value} onClick={() => setAttending(value)} className={`min-h-11 min-w-0 flex-1 rounded-xl border px-2 text-xs font-semibold ${attending === value ? "border-[#355f9e] bg-[#e9f2f8] text-[#214e91]" : "border-[#202523]/15"}`}>{value ? "Attending" : "Can’t Make It"}</button>)}
    </div>
    <div className="mt-4 space-y-4">
      <label className="field-label">Guest name (required)<input className="field-input" disabled placeholder="Your name" /></label>
      {attending && <>
        <label className="field-label">Number attending (required)<select className="field-input" disabled defaultValue="1">{Array.from({ length: settings.rsvp.maxPartySize }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <p className="text-xs leading-5 text-[#202523]/60">Up to {settings.rsvp.maxPartySize} {settings.rsvp.maxPartySize === 1 ? "guest" : "guests"}, including you.</p>
        {settings.features.guestList && <label className="flex min-h-11 items-center gap-3 text-xs leading-5"><input type="checkbox" className="size-4 shrink-0 accent-[#355f9e]" checked={settings.rsvp.guestListDefaultVisible} disabled readOnly />Show my name on the guest list</label>}
      </>}
      {settings.rsvp.allowComments && <label className="field-label">Comment (optional)<textarea className="field-input min-h-20 py-3" disabled placeholder="Anything you’d like the host to know?" /></label>}
      <button type="button" className="primary-button w-full" disabled>Submit RSVP</button>
      <p className="text-xs leading-5 text-[#202523]/55">Preview only. No response can be submitted.{!attending && " Declining requires only a name; no party size is collected."}</p>
    </div>
  </section>;
}

export function DraftHubPreview({ settings }: { settings: DraftSettings }) {
  const modules = DRAFT_HUB_MODULES.filter(({ id }) => settings.features[id]).map((module) => ({
    id: module.id, label: module.guestLabel, icon: module.icon,
    content: <section className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-4">
      <p className="text-[0.6rem] font-bold uppercase tracking-widest text-[#355f9e]">Module preview</p>
      <h4 className="mt-2 font-serif text-2xl">{module.guestLabel}</h4>
      <p className="mt-3 text-sm leading-6 text-[#202523]/65">{module.preview}</p>
    </section>,
  }));
  return <div aria-label="Event Hub preview">
    {modules.length ? <HubNavigation modules={modules} eyebrow="Around the Shindig" /> : <p className="rounded-xl border border-dashed border-[#355f9e]/25 p-4 text-sm leading-6 text-[#202523]/65">A simple gathering. The Hub will show just your event details; no optional modules are selected.</p>}
    <p className="mt-4 text-xs leading-5 text-[#202523]/55">Layout preview only. No guest data, songs, questions, polls or weather are loaded.</p>
  </div>;
}
