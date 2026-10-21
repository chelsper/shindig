"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveHubSectionVisibility } from "../../app/admin/events/[id]/content/actions";
import { HUB_CONTENT_MODULES, hubSectionStatus, type HubContentView } from "../../lib/event-hub-content";
import { EventSaveStatus } from "./event-save-status";

export function HubSectionVisibility({ id, section, enabled: initialEnabled, revision: initialRevision, live, archived = false }: {
  id: string; section: HubContentView; enabled: boolean; revision: number; live: boolean; archived?: boolean;
}) {
  const base = `/admin/events/${id}`;
  const label = HUB_CONTENT_MODULES.find(({ id }) => id === section)!.label;
  const [saved, setSaved] = useState<{ enabled: boolean; revision: number } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [conflict, setConflict] = useState(false), [message, setMessage] = useState("");
  const busy = useRef(false), router = useRouter();
  const { enabled, revision } = saved && saved.revision > initialRevision ? saved : { enabled: initialEnabled, revision: initialRevision };
  const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
  async function toggle() {
    if (busy.current || conflict) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    try {
      const result = await saveHubSectionVisibility({ id, section, enabled: !enabled, revision });
      if (!result.ok) { setError(result.message); setConflict(Boolean(result.conflict)); return; }
      setSaved({ enabled: result.enabled, revision: result.revision });
      setMessage(result.enabled ? "Enabled in your saved setup. Nothing has been published." : "Off in your saved setup. Nothing has been deleted or unpublished.");
      router.refresh();
    } catch { setError("We couldn’t confirm the save. Reload this section to check its setting; your live event hasn’t changed."); }
    finally { busy.current = false; setPending(false); }
  }
  return <section id="hub-section-visibility" aria-labelledby="hub-section-visibility-heading" className={`mb-6 scroll-mt-6 rounded-2xl border p-4 text-sm leading-6 sm:p-5 ${live ? "border-[#b78228]/25 bg-[#fff4d8]" : "border-[#355f9e]/20 bg-[#e9f2f8]/65"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="hub-section-visibility-heading" className="font-semibold">Section visibility</h2><p className="mt-1 font-semibold text-[#355f9e]">{hubSectionStatus(enabled, live)}{live && !enabled && <span className="font-normal"> · Off after publishing</span>}</p></div>
      <button type="button" role="switch" aria-checked={enabled} aria-label={`Include ${label} in saved setup`} aria-describedby="hub-section-switch-help" disabled={pending || conflict} onClick={toggle} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-semibold disabled:opacity-50 ${enabled ? "border-[#355f9e] bg-[#355f9e] text-white" : "border-[#355f9e]/30 bg-[#fffaf1] text-[#355f9e]"}`}><span aria-hidden="true" className="size-2 rounded-full border border-current" />{pending ? "Saving…" : enabled ? "On" : "Off"}</button>
    </div>
    <p id="hub-section-switch-help" className="mt-3">Include {label} in your saved Hub setup. This switch saves privately; it does not change the live page.</p>
    {(saved || pending || error) && <div className="mt-3"><EventSaveStatus savedSinceLoad={Boolean(saved)} pending={pending} failed={Boolean(error)} conflict={conflict} compact /></div>}
    <p className="mt-2">{live
      ? enabled ? "This section is live. Saved content changes here affect the live Hub immediately." : "This section is still live. It is off in your saved setup, but guests can still see it and content edits still take effect until you publish the change."
      : enabled ? "This section is private. Your saved content is not visible to guests yet. Review & publish to include this section on the guest Hub." : "This section is off. You can prepare content below, but it stays private. Turn this section on here, then review & publish when you’re ready."}</p>
    {archived && <p className="mt-2">This event is archived. Restore it from Review &amp; publish before making anything public.</p>}
    <p className="mt-2 text-xs leading-5 text-[#202523]/65">Saving here does not publish the event. Review &amp; publish includes all saved event changes, not just this section. Poll drafts and unapproved questions stay private.</p>
    {message && <p role="status" className="mt-3 font-semibold text-[#285630]">{message}</p>}
    {error && <p role="alert" className="mt-3 text-[#843528]">{error} <a className={link} href={`${base}/content?view=${section}`}>Reload saved section</a></p>}
    <div className="mt-2 flex flex-wrap gap-x-5">
      {(enabled || live) && <Link className={link} href={`${base}/publish`}>{archived ? "Restore & review" : "Review & publish"} →</Link>}
      <Link className={link} href={`${base}/preview?view=hub`}>Preview saved Hub →</Link>
    </div>
  </section>;
}
