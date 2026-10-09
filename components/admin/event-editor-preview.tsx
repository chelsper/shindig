"use client";

import { useState } from "react";
import { eventEditorPreview, type EventEditorFields, type EventEditorPreviewContext } from "../../lib/event-editor-preview";
import { EventDraftPreview } from "./event-draft-preview";
import { DraftRsvpPreview } from "./event-draft-experience-preview";

export function EventEditorPreview({ id, fields, context, dirty }: {
  id: string; fields: EventEditorFields; context: EventEditorPreviewContext | null; dirty: boolean;
}) {
  const { draft, issue } = eventEditorPreview(id, fields);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const missingImage = Boolean(context?.artwork.invitation.path && context.artwork.invitation.path === failedImage);
  const artwork = context && missingImage ? { ...context.artwork, invitation: { path: null, alt: "" } } : context?.artwork;
  return <section aria-label="Live invitation preview" className="min-w-0 [overflow-wrap:anywhere]">
    <div className="mb-4 px-1">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#355f9e]">Your invitation, as you write</p>
      <h2 className="mt-2 font-serif text-2xl">A little look ahead</h2>
      <p className="mt-2 text-xs leading-5 text-[#202523]/65">{dirty ? "Includes unsaved edits" : "Private draft preview"} · Not the live invitation. Guest actions are disabled.</p>
    </div>
    {!context || !artwork ? <p className="rounded-2xl border border-[#b78228]/25 bg-[#fff4d8] p-5 text-sm leading-6" role="status">Saved artwork or RSVP settings couldn’t load, so the preview is unavailable. You can still edit and save details. Reopen the editor to try the preview again.</p> : <>
      {context.settings.revision === 0 && <p className="mb-3 text-xs leading-5 text-[#765319]">RSVP preview uses suggested defaults. Confirm them in RSVP &amp; Hub before publishing.</p>}
      {issue && <p className="mb-3 rounded-xl bg-[#fff4d8] p-3 text-xs leading-5 text-[#765319]">Preview note: {issue}</p>}
      {missingImage && <p role="status" className="mb-3 text-xs leading-5 text-[#765319]">Artwork couldn’t load. The saved image has not changed.</p>}
      <div className="overflow-hidden rounded-3xl" onErrorCapture={(event) => {
        if (event.target instanceof HTMLImageElement) setFailedImage(context.artwork.invitation.path);
      }}>
        <EventDraftPreview draft={draft} artwork={artwork} view="invitation">
          <DraftRsvpPreview settings={context.settings.settings} timeZone={draft.timeZone} />
        </EventDraftPreview>
      </div>
    </>}
  </section>;
}
