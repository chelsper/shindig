"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeEventLifecycle } from "../../app/admin/events/[id]/publish/actions";
import { availableLifecycleActions, eventStatus, type EventLifecycle, type LifecycleAction } from "../../lib/event-lifecycle";

const descriptions: Record<LifecycleAction, { label: string; message: string; success: string }> = {
  "close-rsvps": { label: "Close RSVPs", message: "Stop new RSVPs and guest edits. The invitation and Event Hub stay available while published, and you can still manage responses here.", success: "RSVPs are closed. Existing responses are safe." },
  "reopen-rsvps": { label: "Reopen RSVPs", message: "Allow new RSVPs and guest edits again when this event is published, subject to its published deadline and capacity. This does not publish a hidden event or any draft changes.", success: "The manual RSVP switch is open. Published deadlines and capacity still apply. An unpublished event remains hidden until you republish it." },
  unpublish: { label: "Unpublish event", message: "Hide the invitation, Event Hub, calendar downloads and guest actions from shared links. Your guests, content and artwork are retained. Republish after reviewing below to restore the same links. Calendar files already downloaded cannot be recalled.", success: "Event unpublished. Guest links are unavailable; all your data is retained." },
  archive: { label: "Archive event", message: "Move this gathering to Archived, close RSVPs and guest edits, and hide all public pages and guest actions. Keep every response, private edit link, piece of artwork and Hub contribution. You can still manage saved content and export RSVPs. Nothing is deleted; downloaded calendars and previously viewed content cannot be recalled.", success: "Event archived. All saved data is retained and guest access is closed." },
  restore: { label: "Restore event", message: "Return this gathering to your active events as Unpublished with RSVPs closed. Nothing becomes public and no messages are sent. Review and republish separately when ready; reopening RSVPs is also a separate choice.", success: "Event restored privately. RSVPs remain closed until you explicitly reopen them." },
};

export function EventLifecycleControls({ id, live }: { id: string; live: EventLifecycle & { revision: number } }) {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const busy = useRef(false), router = useRouter();
  const [done, setDone] = useState(false);
  const button = "min-h-12 rounded-full border border-[#355f9e]/30 px-5 py-3 text-sm font-semibold text-[#355f9e] disabled:opacity-50";
  return <section aria-labelledby="event-controls-heading" className="rounded-3xl border border-[#202523]/15 bg-[#fffaf1] p-5 sm:p-7">
    <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">{eventStatus(live)}</p>
    <h2 id="event-controls-heading" className="mt-2 font-serif text-2xl">{live.visibility === "archived" ? "A gathering worth keeping" : "Guest access"}</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">{live.visibility === "archived" ? "Public pages and guest actions are unavailable. Restore privately before publishing or reopening RSVPs. Your saved data is still here." : `RSVPs ${live.rsvpsOpen ? "open" : "closed"}. These controls take effect immediately. They never publish private draft edits.`}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {availableLifecycleActions(live).map((nextAction) => <button key={nextAction} className={button} type="button" disabled={!!action || pending || done} onClick={() => { setAction(nextAction); setMessage(""); }}>{descriptions[nextAction].label}</button>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-[#202523]/60">The manual switch does not override a published RSVP deadline or capacity. Change limits in RSVP &amp; Hub, then review and publish.</p>
    {action && <div className="mt-5 rounded-2xl border border-[#b78228]/25 bg-[#fff4d8] p-4">
      <p className="text-sm leading-6">{descriptions[action].message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="primary-button min-h-12 px-5 text-sm" type="button" disabled={pending || done} onClick={() => {
          if (busy.current || done) return;
          busy.current = true; setMessage("");
          startTransition(async () => {
            try {
              const result = await changeEventLifecycle(id, live.revision, action, true);
              if (!result.ok) { setMessage(result.message); return; }
              setDone(true); setMessage(descriptions[action].success); setAction(null); router.refresh();
            } catch { setMessage("The change couldn’t be confirmed. Refresh to check the current status before trying again."); }
            finally { busy.current = false; }
          });
        }}>{pending ? "Saving…" : `Confirm: ${descriptions[action].label}`}</button>
        <button className={button} type="button" disabled={pending || done} onClick={() => setAction(null)}>Cancel</button>
      </div>
    </div>}
    {message && <p role="status" className="mt-4 text-sm leading-6">{message}</p>}
  </section>;
}
