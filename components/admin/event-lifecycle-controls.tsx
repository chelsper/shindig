"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeEventLifecycle } from "../../app/admin/events/[id]/publish/actions";
import { eventStatus, type EventLifecycle, type LifecycleAction } from "../../lib/event-lifecycle";

const descriptions: Record<LifecycleAction, { label: string; message: string; success: string }> = {
  "close-rsvps": { label: "Close RSVPs", message: "Stop new RSVPs and guest edits. The invitation and Event Hub stay available while published, and you can still manage responses here.", success: "RSVPs are closed. Existing responses are safe." },
  "reopen-rsvps": { label: "Reopen RSVPs", message: "Allow new RSVPs and guest edits again when this event is published. This does not publish a hidden event or any draft changes.", success: "RSVPs are open. An unpublished event remains hidden until you republish it." },
  unpublish: { label: "Unpublish event", message: "Hide the invitation, Event Hub, calendar downloads and guest actions from shared links. Your guests, content and artwork are retained. Republish after reviewing below to restore the same links. Calendar files already downloaded cannot be recalled.", success: "Event unpublished. Guest links are unavailable; all your data is retained." },
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
    <h2 id="event-controls-heading" className="mt-2 font-serif text-2xl">Guest access</h2>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">RSVPs {live.rsvpsOpen ? "open" : "closed"}. These controls take effect immediately. They never publish private draft edits.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button className={button} type="button" disabled={!!action || pending || done} onClick={() => { setAction(live.rsvpsOpen ? "close-rsvps" : "reopen-rsvps"); setMessage(""); }}>{live.rsvpsOpen ? "Close RSVPs" : "Reopen RSVPs"}</button>
      {live.visibility === "published" && <button className={button} type="button" disabled={!!action || pending || done} onClick={() => { setAction("unpublish"); setMessage(""); }}>Unpublish event</button>}
    </div>
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
