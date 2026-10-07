"use client";
import { useRef, useState } from "react";
import { checkEventLink } from "../../app/admin/events/[id]/publish/actions";
import { EVENT_ALIAS_MAX_LENGTH, validateEventAlias } from "../../lib/event-alias";
import { draftEventSlug, eventPaths } from "../../lib/event-routes";
import { SHINDIG_SITE } from "../../lib/site";

export function EventLinkField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [message, setMessage] = useState(""), [checking, setChecking] = useState(false);
  const request = useRef(0);
  const parsed = validateEventAlias(value);
  const preview = parsed.ok ? new URL(eventPaths(parsed.alias ?? draftEventSlug(id)).invitation, SHINDIG_SITE.url).toString() : null;
  return <fieldset className="rounded-3xl border border-[#355f9e]/20 bg-[#e9f2f8]/40 p-5 sm:p-7" disabled={disabled}>
    <legend className="px-2 font-serif text-2xl">Give your gathering a link</legend>
    <label className="field-label" htmlFor="event-link">Event link <span className="font-normal normal-case tracking-normal">(optional)</span></label>
    <input id="event-link" className="field-input mt-2" value={value} maxLength={EVENT_ALIAS_MAX_LENGTH} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="event-link-help event-link-status" onChange={(e) => { request.current++; setChecking(false); setMessage(""); onChange(e.target.value); }} />
    {preview && <p className="mt-3 break-all text-sm leading-6 text-[#214e91]">{preview}</p>}
    <p id="event-link-help" className="mt-3 text-sm leading-6 text-[#202523]/65">Choose before your first publication. The link stays fixed afterward, even if the title changes. Leave blank to keep the original link. Nothing is reserved or shared until you publish.</p>
    <button type="button" disabled={disabled || checking || !value.trim() || !parsed.ok} className="mt-3 min-h-12 rounded-full border border-[#355f9e]/30 px-5 text-sm font-semibold text-[#355f9e] disabled:opacity-50" onClick={async () => {
      const number = ++request.current; setChecking(true); setMessage("");
      try {
        const result = await checkEventLink(id, value);
        if (number === request.current) setMessage(result.ok ? result.available ? "Available right now. It’s reserved only when you publish." : "That link is already in use. Try adding a year or another word." : result.message);
      } catch { if (number === request.current) setMessage("Link availability couldn’t be checked. Please try again."); }
      finally { if (number === request.current) setChecking(false); }
    }}>{checking ? "Checking…" : "Check link"}</button>
    <p id="event-link-status" role="status" className="mt-2 text-sm leading-6">{!parsed.ok ? parsed.message : message}</p>
  </fieldset>;
}
