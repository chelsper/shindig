"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventDraft } from "../../lib/event-drafts";
import { locationNumbers, type AddressMatch } from "../../lib/event-location";
import { findEventAddress, saveEventLocation } from "../../app/admin/events/[id]/location/actions";
import { EventSetupNavigation } from "./event-setup-navigation";

export function EventLocationEditor({ draft }: { draft: EventDraft }) {
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [manual, setManual] = useState(false), [latitude, setLatitude] = useState(""), [longitude, setLongitude] = useState("");
  const [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState("");
  const [pending, setPending] = useState<"find" | "save" | null>(null);
  const [saved, setSaved] = useState(draft.location ?? null), [revision, setRevision] = useState(draft.revision);
  const lock = useRef(false), router = useRouter();
  const candidate = manual ? locationNumbers(latitude, longitude) : selected === null ? null : matches?.[selected] ?? null;
  const base = `/admin/events/${draft.id}`;
  const link = "inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline underline-offset-4";
  async function find() {
    if (lock.current) return;
    lock.current = true; setPending("find"); setMessage(""); setSelected(null); setConfirmed(false); setMatches(null);
    try {
      const result = await findEventAddress(draft.id, revision);
      if (!result.ok) { setMessage(result.message); return; }
      setMatches(result.matches);
      if (!result.matches.length) setMessage("No matching address found. Check Details, or use manual coordinates below.");
    } catch { setMessage("Address search couldn’t connect. Please try again or use manual coordinates."); }
    finally { lock.current = false; setPending(null); }
  }
  async function save() {
    if (lock.current || !candidate || !confirmed) return;
    lock.current = true; setPending("save"); setMessage("");
    try {
      const result = await saveEventLocation(draft.id, revision, { ...candidate, source: manual ? "manual" : "census" }, confirmed);
      if (!result.ok) { setMessage(result.message); return; }
      setSaved(result.location); setRevision(result.revision); setConfirmed(false); setSelected(null); setManual(false);
      setMessage("Location saved with your private draft. Review & publish when you’re ready."); router.refresh();
    } catch { setMessage("We couldn’t confirm the save. Reload this page to check before trying again."); }
    finally { lock.current = false; setPending(null); }
  }
  return <div className="space-y-6 pb-10">
    <EventSetupNavigation id={draft.id} current="location" onNavigate={(event) => { if (lock.current) event.preventDefault(); }} />
    <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Where we’re gathering</h2>
      <p className="mt-3 break-words text-sm leading-6">{draft.venue && <span className="block font-semibold">{draft.venue}</span>}{draft.address || "Save an address in Details first."}</p>
      <Link className={link} href={`${base}#draft-place-heading`}>Edit the address →</Link>
      <p className="text-xs leading-5 text-[#202523]/65">Timezone: {draft.timeZone}. Address matching does not change event times. Check the timezone in Details if you change regions.</p>
    </section>
    {saved && <section className="rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 p-5 sm:p-7" aria-label="Saved location">
      <h2 className="font-serif text-2xl">Location confirmed</h2>
      <p className="mt-2 break-words text-sm leading-6">{saved.matchedAddress}</p>
      <p className="mt-1 text-xs leading-5">{saved.latitude.toFixed(5)}, {saved.longitude.toFixed(5)} · {saved.source === "census" ? "U.S. Census address match" : saved.source === "published" ? "Previously reviewed location" : "Manually confirmed"}</p>
      <p className="mt-3 text-sm leading-6">Saved privately. Changing the street address clears this confirmation. Live pages change only after publishing.</p>
      <Link className={link} href={`${base}/publish`}>Continue to review &amp; publish →</Link>
    </section>}
    {draft.address && <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-7" aria-labelledby="find-location-heading">
      <h2 id="find-location-heading" className="font-serif text-2xl">{saved ? "Check another match" : "Find your event address"}</h2>
      <p id="address-privacy" className="mt-2 text-sm leading-6 text-[#202523]/70">Find address sends the saved address above to the U.S. Census address matcher. U.S. addresses only; matches are approximate street locations. Nothing is saved until you confirm.</p>
      <button type="button" className="primary-button mt-4 w-full px-6 sm:w-auto" aria-describedby="address-privacy" disabled={pending !== null} onClick={find}>{pending === "find" ? "Finding address…" : "Find address"}</button>
      {matches && matches.length > 0 && <fieldset className="mt-5 space-y-3"><legend className="mb-2 text-sm font-semibold">Choose the matching place</legend>{matches.map((match, index) => <label key={index} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-[#355f9e]/20 p-4 text-sm leading-6">
        <input type="radio" name="address-match" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={!manual && selected === index} disabled={pending !== null} onChange={() => { setSelected(index); setManual(false); setConfirmed(false); setMessage(""); }} />
        <span className="min-w-0 break-words">{match.matchedAddress}<span className="block text-xs text-[#202523]/65">{match.latitude.toFixed(5)}, {match.longitude.toFixed(5)}</span></span>
      </label>)}</fieldset>}
      <details className="mt-5 rounded-2xl border border-[#202523]/15 p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Enter coordinates manually</summary>
        <p className="mt-2 text-xs leading-5">For unmatched or international addresses, use verified coordinates for the event address—not your device location. Latitude runs north/south; longitude runs east/west.</p>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[#355f9e]" checked={manual} disabled={pending !== null} onChange={(e) => { setManual(e.target.checked); setConfirmed(false); setMessage(""); }} />Use manual coordinates</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="field-label min-w-0">Latitude<input className="field-input w-full" type="number" step="any" min="-90" max="90" placeholder="e.g. 38.846" value={latitude} disabled={!manual || pending !== null} onChange={(e) => { setLatitude(e.target.value); setConfirmed(false); setMessage(""); }} /></label>
          <label className="field-label min-w-0">Longitude<input className="field-input w-full" type="number" step="any" min="-180" max="180" placeholder="e.g. -76.927" value={longitude} disabled={!manual || pending !== null} onChange={(e) => { setLongitude(e.target.value); setConfirmed(false); setMessage(""); }} /></label>
        </div>
      </details>
      {candidate && <div className="mt-5 border-t border-[#202523]/10 pt-4">
        <label className="flex min-h-12 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={confirmed} disabled={pending !== null} onChange={(e) => setConfirmed(e.target.checked)} /><span>I checked this is the event location. These coordinates may be public when I publish with Weather enabled.</span></label>
        <button type="button" className="primary-button mt-4 w-full" disabled={!confirmed || pending !== null} onClick={save}>{pending === "save" ? "Saving location…" : "Confirm & save location"}</button>
      </div>}
    </section>}
    {message && <p role="status" aria-live="polite" className="rounded-2xl bg-[#e9f2f8] p-4 text-sm leading-6">{message}</p>}
    <p className="text-xs leading-5 text-[#202523]/65">Location confirmation is required only when Weather is enabled. No device location is used, and Jasper Shucks is unchanged.</p>
  </div>;
}
