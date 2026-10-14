"use client";
import { useId } from "react";
import { CONTACT_PERMISSION_COPY, type GuestContactPreferences } from "../../lib/rsvp-contacts";

export function ContactPreferencesFields({ value, onChange, disabled = false }: {
  value: GuestContactPreferences; onChange: (value: GuestContactPreferences) => void; disabled?: boolean;
}) {
  const id = useId();
  if (value.collectionClosed) return <p className="text-sm leading-6 text-[#202523]/65">Contact collection has ended. Your RSVP is still saved, but this event no longer stores text or email update preferences.</p>;
  return <fieldset disabled={disabled} className="contact-preferences mt-5 min-w-0 border-t border-[#202523]/10 pt-4" aria-describedby={`${id}-help`}>
    <legend className="float-left mb-1 w-full text-sm font-semibold">Want updates about this event? <span className="font-normal text-[#202523]/55">(optional)</span></legend>
    <p id={`${id}-help`} className="clear-both text-xs leading-5 text-[#202523]/65">{CONTACT_PERMISSION_COPY} You can change your mind using your private RSVP link. Shindig won’t send messages automatically.</p>
    <div className="mt-2 grid gap-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-[#355f9e]" checked={value.textOptIn} onChange={(e) => onChange({ ...value, textOptIn: e.target.checked, phone: e.target.checked ? value.phone : null })} />By text</label>
      {value.textOptIn && <label className="field-label mb-2">Phone number<input className="field-input" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} required placeholder="+1 904 555 0123" value={value.phone ?? ""} onChange={(e) => onChange({ ...value, phone: e.target.value })} /><span className="text-xs font-normal normal-case tracking-normal text-[#202523]/60">For numbers outside the US/Canada, include + and the country code.</span></label>}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-[#355f9e]" checked={value.emailOptIn} onChange={(e) => onChange({ ...value, emailOptIn: e.target.checked, email: e.target.checked ? value.email : null })} />By email</label>
      {value.emailOptIn && <label className="field-label mb-2">Email address<input className="field-input" type="email" autoComplete="email" inputMode="email" maxLength={254} required placeholder="you@example.com" value={value.email ?? ""} onChange={(e) => onChange({ ...value, email: e.target.value })} /></label>}
  </div></fieldset>;
}
