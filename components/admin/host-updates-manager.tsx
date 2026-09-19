"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { createHostUpdate, deleteHostUpdate, editHostUpdate } from "../../app/admin/updates/actions";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import type { AdminHostUpdate } from "../../lib/server/updates";
import { UPDATE_LIMITS } from "../../lib/updates";
import { ContentDeleteButton } from "./content-delete-button";

function UpdateEditor({ update, onSaved, onCancel }: { update?: AdminHostUpdate; onSaved?: () => void; onCancel?: () => void }) {
  const [heading, setHeading] = useState(update?.heading ?? "");
  const [message, setMessage] = useState(update?.message ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        requestId.current ??= crypto.randomUUID();
        const result = update
          ? await editHostUpdate(update.id, { heading, message })
          : await createHostUpdate(requestId.current, { heading, message });
        if (!result.ok) { setError(result.message); return; }
        setSaved(true);
        if (!update) { setHeading(""); setMessage(""); requestId.current = null; }
        onSaved?.();
      } catch {
        setError("We couldn’t save your update. Please try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <fieldset className="space-y-4" disabled={pending}>
        <legend className="sr-only">{update ? "Edit update" : "Write an update"}</legend>
        <label className="field-label">Heading (optional)<input className="field-input" maxLength={UPDATE_LIMITS.heading} name="heading" onChange={(event) => setHeading(event.target.value)} value={heading} /></label>
        <label className="field-label">Message<textarea className="field-input min-h-32 resize-y" maxLength={UPDATE_LIMITS.message} name="message" onChange={(event) => setMessage(event.target.value)} required rows={4} value={message} /></label>
        <p className="text-xs leading-5 text-[#202523]/60">{update ? "Changes appear immediately. The original published date stays the same." : "This update will appear publicly on the Event Hub."}</p>
        {error ? <p className="text-sm text-[#843528]" role="alert">{error}</p> : null}
        {saved ? <p className="text-sm text-[#285630]" role="status">{update ? "Update saved." : "Your update is published!"}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button className="primary-button" disabled={pending} type="submit">{pending ? "Saving…" : update ? "Save changes" : "Publish update"}</button>
          {onCancel ? <button className="min-h-11 px-4 text-sm text-[#355f9e] underline underline-offset-4" onClick={onCancel} type="button">Cancel</button> : null}
        </div>
      </fieldset>
    </form>
  );
}

function HostUpdateCard({ update }: { update: AdminHostUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <li className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1]/85 p-5 sm:p-6">
      <p className="mb-3 text-xs text-[#355f9e]">Published {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: OYSTER_ROAST_EVENT.timeZone }).format(new Date(update.publishedAt))}</p>
      {editing ? <UpdateEditor update={update} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setSaved(true); }} /> : (
        <>
          {update.heading ? <h2 className="break-words font-serif text-2xl">{update.heading}</h2> : null}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{update.message}</p>
          {saved ? <p className="mt-3 text-sm text-[#285630]" role="status">Update saved.</p> : null}
          <div className="mt-4 flex flex-wrap items-start gap-2">
            <button className="min-h-11 rounded-full border border-[#355f9e]/25 px-4 text-xs font-semibold text-[#355f9e]" onClick={() => { setEditing(true); setSaved(false); }} type="button">Edit</button>
            <ContentDeleteButton label="update" onDelete={() => deleteHostUpdate(update.id, true)} />
          </div>
        </>
      )}
    </li>
  );
}

export function HostUpdatesManager({ updates }: { updates: AdminHostUpdate[] }) {
  return (
    <div className="space-y-6">
      <section aria-label="Write an update" className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 sm:p-7">
        <h2 className="mb-5 font-serif text-2xl">A little note for your guests</h2>
        <UpdateEditor />
      </section>
      {updates.length === 0 ? <p className="py-5 text-center font-serif text-2xl text-[#202523]/65">No updates published yet.</p> : <ol aria-label="Published updates" className="space-y-4">{updates.map((update) => <HostUpdateCard key={update.id} update={update} />)}</ol>}
    </div>
  );
}
