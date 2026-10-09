"use client";
import { useState } from "react";

// Legacy invitations don't use the newer per-event publish/share screen.
// Keep their existing public URL easy to copy without changing any event data.
export function LegacyEventShare({ url }: { url: string }) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState("");
  return <div className="col-span-2 sm:basis-full">
    <button type="button" aria-expanded={open} aria-controls="legacy-invitation-share" className="inline-flex min-h-11 items-center rounded-full border border-[#355f9e]/20 px-4 py-2 text-sm font-semibold text-[#355f9e] hover:bg-[#e9f2f8]" onClick={() => setOpen(!open)}>Share</button>
    {open && <div id="legacy-invitation-share" className="mt-3 rounded-xl border border-[#355f9e]/20 bg-[#e9f2f8]/40 p-4 text-sm">
      <label htmlFor="legacy-invitation-link" className="font-semibold">Invitation link</label>
      <input id="legacy-invitation-link" className="field-input mt-2 w-full min-w-0 text-sm" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline underline-offset-4" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setMessage("Invitation link copied!"); }
        catch { setMessage("Select the link above to copy it manually."); }
      }}>Copy link</button>
      <p role="status" className="text-xs leading-5">{message}</p>
    </div>}
  </div>;
}
