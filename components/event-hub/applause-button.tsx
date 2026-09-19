"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { applaudSong } from "../../app/event/interaction-actions";
import { useGuestInteractions } from "../guest-interactions-provider";

export function ApplauseButton({ songKey, songTitle, count }: { songKey: string; songTitle: string; count: number }) {
  const guest = useGuestInteractions();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const active = guest.applauded.includes(songKey);
  const [optimistic, setOptimistic] = useOptimistic({ count, active });
  function clap() {
    if (!guest.ready || busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      setOptimistic({ active: !active, count: Math.max(0, count + (active ? -1 : 1)) });
      try {
        const result = await applaudSong(songKey, !active);
        if (!result.ok) { setError(result.message); return; }
        guest.recordApplause(songKey, result.data.active);
      } catch { setError("Your applause didn’t save. Give it another try."); }
      finally { busy.current = false; }
    });
  }
  return <div>
    <button type="button" aria-label={`${optimistic.active ? "Remove applause from" : "Applaud"} ${songTitle}; ${optimistic.count} applause`} aria-pressed={optimistic.active} aria-busy={pending} disabled={!guest.ready || pending} onClick={clap}
      className={`inline-flex min-h-11 min-w-16 items-center justify-center gap-2 rounded-full border px-3 text-sm tabular-nums transition motion-reduce:transition-none active:scale-95 motion-reduce:transform-none disabled:cursor-wait ${optimistic.active ? "border-[#355f9e]/35 bg-[#e9f2f8] text-[#214e91]" : "border-[#202523]/15 bg-white/30 text-[#202523]/70"}`}>
      <span aria-hidden="true">👏</span><span>{optimistic.count}</span>
    </button>
    {error ? <p role="alert" className="mt-1 max-w-xs text-xs text-[#843528]">{error}</p> : null}
  </div>;
}
