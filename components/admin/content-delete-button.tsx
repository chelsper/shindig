"use client";

import { useRef, useState, useTransition } from "react";
import type { HostContentResult } from "../../app/admin/updates/actions";

export function ContentDeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<HostContentResult> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  function remove() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await onDelete();
        if (!result.ok) setError(result.message);
      } catch {
        setError("We couldn’t delete this. Please try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <div>
      {confirming ? (
        <div>
          <p className="mb-2 text-xs leading-5 text-[#202523]/65">Delete this {label}? This can’t be undone.</p>
          <div className="flex flex-wrap gap-2">
            <button className="min-h-11 rounded-full border border-[#843528]/30 bg-[#fff0e9] px-4 text-xs font-semibold text-[#843528] disabled:opacity-50" disabled={pending} onClick={remove} type="button">{pending ? "Deleting…" : "Yes, delete"}</button>
            <button className="min-h-11 rounded-full border border-[#202523]/20 px-4 text-xs font-semibold" disabled={pending} onClick={() => { setConfirming(false); setError(null); }} type="button">Cancel</button>
          </div>
        </div>
      ) : <button className="min-h-11 rounded-full border border-[#843528]/20 px-4 text-xs font-semibold text-[#843528] hover:bg-[#fff0e9]" onClick={() => setConfirming(true)} type="button">Delete</button>}
      {error ? <p className="mt-2 text-xs leading-5 text-[#843528]" role="alert">{error}</p> : null}
    </div>
  );
}
