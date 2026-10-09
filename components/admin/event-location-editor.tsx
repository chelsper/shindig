"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { EventDraft } from "../../lib/event-drafts";
import { eventAddressQuery, locationNumbers, parseEventLocation, type AddressMatch } from "../../lib/event-location";
import { findEventAddress, saveEventLocation } from "../../app/admin/events/[id]/location/actions";
import { EventSetupNavigation } from "./event-setup-navigation";
import { DraftEditorActionBar } from "./draft-editor-action-bar";

export function EventLocationEditor({ draft }: { draft: EventDraft }) {
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [manual, setManual] = useState(false), [latitude, setLatitude] = useState(""), [longitude, setLongitude] = useState("");
  const [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null), [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<"find" | "save" | null>(null);
  const [saved, setSaved] = useState(parseEventLocation(draft.location, draft.address)), [revision, setRevision] = useState(draft.revision);
  const lock = useRef(false);
  const dirty = manual || selected !== null;
  const candidate = manual ? locationNumbers(latitude, longitude) : selected === null ? null : matches?.[selected] ?? null;
  const base = `/admin/events/${draft.id}`;
  const addressQuery = eventAddressQuery(draft.address, draft.cityLabel);
  const link = "inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline underline-offset-4";
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (lock.current || (dirty && !window.confirm("Leave without saving your location choice?"))) event.preventDefault();
  }
  function changed() { setConfirmed(false); setMessage(""); setError(null); }
  async function find() {
    if (lock.current || conflict || !draft.address.trim()) return;
    lock.current = true; setPending("find"); setMessage(""); setError(null);
    try {
      const result = await findEventAddress(draft.id, revision);
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setMatches(result.matches); setSelected(null); setConfirmed(false);
      if (!result.matches.length) setMessage("No matching address found. In Details, include the street address plus city and state or ZIP code, save, then try again. You can also use manual coordinates below.");
    } catch { setError("Address search couldn’t connect. Please try again or use manual coordinates."); }
    finally { lock.current = false; setPending(null); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || conflict || !dirty || !draft.address.trim()) return;
    setError(null); setMessage("");
    if (!candidate || !confirmed) { setError("Choose a valid location and check the confirmation before saving."); return; }
    lock.current = true; setPending("save");
    try {
      const result = await saveEventLocation(draft.id, revision, { ...candidate, source: manual ? "manual" : "census" }, confirmed);
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setSaved(result.location); setRevision(result.revision); setConfirmed(false); setSelected(null); setManual(false); setLatitude(""); setLongitude(""); setMatches(null);
      setMessage("Location saved with your private draft. Continue setup to see what’s left. Nothing has been published.");
    } catch { setError("We couldn’t confirm the save. Reopen the saved location to check before trying again."); setConflict(true); }
    finally { lock.current = false; setPending(null); }
  }
  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 pt-6 pb-72 text-[#202523] sm:px-6 sm:pt-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-3xl">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5"><Link className="font-serif text-2xl" href="/admin/events" onClick={leave}>Shindig</Link><Link className={`${link} text-xs`} href="/admin/events" onClick={leave}>Back to your events</Link></header>
    <section className="pt-7"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Event setup · Private draft</p><h1 className="mt-2 font-serif text-4xl sm:text-5xl">Set the scene</h1><p className="mt-3 break-words text-sm leading-6 text-[#202523]/65">Location for {draft.title}. Confirm the place once, so Weather is ready when you publish.</p></section>
    <EventSetupNavigation id={draft.id} current="location" onNavigate={leave} />
    <div className="space-y-6">
    <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Where we’re gathering</h2>
      <p className="mt-3 break-words text-sm leading-6">{draft.venue && <span className="block font-semibold">{draft.venue}</span>}{addressQuery || "Save an address in Details first."}</p>
      <Link className={link} href={`${base}#draft-place-heading`} onClick={leave}>Edit the address →</Link>
      <p className="text-xs leading-5 text-[#202523]/65">Timezone: {draft.timeZone}. Address matching does not change event times. Check the timezone in Details if you change regions.</p>
    </section>
    {saved && <section className="rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 p-5 sm:p-7" aria-label="Saved location">
      <h2 className="font-serif text-2xl">Location confirmed</h2>
      <p className="mt-2 break-words text-sm leading-6">{saved.matchedAddress}</p>
      <p className="mt-1 text-xs leading-5">{saved.latitude.toFixed(5)}, {saved.longitude.toFixed(5)} · {saved.source === "census" ? "U.S. Census address match" : saved.source === "published" ? "Previously reviewed location" : "Manually confirmed"}</p>
      <p className="mt-3 text-sm leading-6">Saved privately. Changing the address or city/area clears this confirmation. Live pages change only after publishing.</p>
    </section>}
    <form id="event-location-form" aria-label="Event location" noValidate onSubmit={save}>
    <fieldset disabled={pending !== null || conflict} className="min-w-0">
    {draft.address && <section className="rounded-3xl border border-[#202523]/10 bg-[#fffaf1] p-5 sm:p-7" aria-labelledby="find-location-heading">
      <h2 id="find-location-heading" className="font-serif text-2xl">{saved ? "Check another match" : "Find your event address"}</h2>
      <p id="address-privacy" className="mt-2 text-sm leading-6 text-[#202523]/70">Find address sends the saved address above, including city/area when needed, to the U.S. Census address matcher. Include a city and state or ZIP code in Details. U.S. addresses only; matches are approximate street locations. Nothing is saved until you confirm.</p>
      <button type="button" className="primary-button mt-4 w-full px-6 sm:w-auto" aria-describedby="address-privacy" disabled={pending !== null || manual} onClick={find}>{pending === "find" ? "Finding address…" : "Find address"}</button>
      {matches && matches.length > 0 && <fieldset className="mt-5 space-y-3"><legend className="mb-2 text-sm font-semibold">Choose the matching place</legend>{matches.map((match, index) => <label key={index} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-[#355f9e]/20 p-4 text-sm leading-6">
        <input type="radio" name="address-match" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={!manual && selected === index} disabled={pending !== null} onChange={() => { setSelected(index); setManual(false); changed(); }} />
        <span className="min-w-0 break-words">{match.matchedAddress}<span className="block text-xs text-[#202523]/65">{match.latitude.toFixed(5)}, {match.longitude.toFixed(5)}</span></span>
      </label>)}</fieldset>}
      <details className="mt-5 rounded-2xl border border-[#202523]/15 p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Enter coordinates manually</summary>
        <p className="mt-2 text-xs leading-5">For unmatched or international addresses, use verified coordinates for the event address—not your device location. Latitude runs north/south; longitude runs east/west.</p>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[#355f9e]" checked={manual} disabled={pending !== null} onChange={(e) => { setManual(e.target.checked); setSelected(null); changed(); }} />Use manual coordinates</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="field-label min-w-0">Latitude<input className="field-input w-full" type="number" step="any" min="-90" max="90" placeholder="e.g. 38.846" value={latitude} disabled={!manual || pending !== null} onChange={(e) => { setLatitude(e.target.value); changed(); }} /></label>
          <label className="field-label min-w-0">Longitude<input className="field-input w-full" type="number" step="any" min="-180" max="180" placeholder="e.g. -76.927" value={longitude} disabled={!manual || pending !== null} onChange={(e) => { setLongitude(e.target.value); changed(); }} /></label>
        </div>
      </details>
      {candidate && <div className="mt-5 border-t border-[#202523]/10 pt-4">
        <label className="flex min-h-12 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#355f9e]" checked={confirmed} disabled={pending !== null} onChange={(e) => setConfirmed(e.target.checked)} /><span>I checked this is the event location. These coordinates may be public when I publish with Weather enabled.</span></label>
      </div>}
    </section>}
    </fieldset>
    </form>
    <p className="text-xs leading-5 text-[#202523]/65">Location confirmation is required only when Weather is enabled. No device location is used, and Jasper Shucks is unchanged.</p>
    </div></div>
    <DraftEditorActionBar formId="event-location-form" saveLabel="Save location" saveAccessibleLabel="Confirm & save location" saveAllowed={Boolean(candidate && confirmed && dirty)} pendingLabel={pending === "find" ? "Finding…" : "Saving location…"}
      pending={pending !== null} dirty={dirty} conflict={conflict} reviewReady reviewHref={`${base}/setup`} reviewLabel="Continue setup"
      error={error} reopenHref={`${base}/location`} reopenLabel="Reopen saved location" onLeave={leave}
      status={pending === "find" ? "Finding address… Nothing is saved yet." : pending === "save" ? "Saving location privately…" : conflict ? "Reopen the latest location before continuing." : message || (dirty ? confirmed ? "Your location choice is unsaved. Save before continuing." : "Check your location and confirm it before saving." : saved ? "Location confirmed and saved privately. Continue setup for your next step." : "Location confirmation is needed only with Weather. Your setup checklist will guide you.")} />
  </main>;
}
