"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { updateContactPreferences } from "../../app/rsvp/contact-actions";
import type { GuestContactPreferences } from "../../lib/rsvp-contacts";
import { ContactPreferencesFields } from "./contact-preferences-fields";

export function ContactPreferencesForm({ initial, token, eventSlug }: { initial: GuestContactPreferences; token: string; eventSlug: string }) {
  const [value, setValue] = useState(initial), [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition(), saving = useRef(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true; setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateContactPreferences(eventSlug, token, value);
        if (result.ok) { setValue(result.preferences); setMessage("Update preferences saved. Unchecked contact details have been removed."); }
        else setMessage(result.message);
      } catch { setMessage("We couldn’t save your update preferences. Please try again."); }
      finally { saving.current = false; }
    });
  }
  return <section className="mt-5 rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-8" aria-label="Private update preferences">
    <h2 className="font-serif text-2xl">Keep in touch</h2>
    <p className="mt-2 text-xs leading-5 text-[#202523]/65">These preferences are separate from your attendance. You can remove your contact details even when RSVP replies are closed.</p>
    <form onSubmit={submit}>
      <ContactPreferencesFields value={value} onChange={(next) => { setValue(next); setMessage(null); }} disabled={pending} />
      {!value.collectionClosed && <button className="primary-button mt-4 w-full" disabled={pending} type="submit">{pending ? "Saving preferences…" : "Save update preferences"}</button>}
      {message && <p role="status" className="mt-3 text-sm leading-6">{message}</p>}
    </form>
  </section>;
}
