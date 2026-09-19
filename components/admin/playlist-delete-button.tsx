"use client";

import { useActionState, useState } from "react";

import { deleteAdminPlaylistSuggestion } from "../../app/admin/playlist/actions";

export function PlaylistDeleteButton({ id, songTitle }: { id: string; songTitle: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteAdminPlaylistSuggestion.bind(null, id), { error: null });

  return (
    <div className="mt-4 sm:mt-0 sm:max-w-60">
      {confirming ? (
        <form action={action}>
          <p className="mb-2 break-words text-xs leading-5 text-[#202523]/65">Delete “{songTitle}” from the playlist?</p>
          <div className="flex flex-wrap gap-2">
            <button className="min-h-11 rounded-full border border-[#843528]/30 bg-[#fff0e9] px-4 text-xs font-semibold text-[#843528] disabled:opacity-50" disabled={pending} name="confirm" type="submit" value="delete">{pending ? "Deleting…" : "Yes, delete"}</button>
            <button className="min-h-11 rounded-full border border-[#202523]/20 px-4 text-xs font-semibold" disabled={pending} onClick={() => setConfirming(false)} type="button">Cancel</button>
          </div>
        </form>
      ) : (
        <button aria-label={`Delete ${songTitle}`} className="min-h-11 rounded-full border border-[#843528]/20 px-4 text-xs font-semibold text-[#843528] transition hover:bg-[#fff0e9]" onClick={() => setConfirming(true)} type="button">Delete</button>
      )}
      {state.error ? <p className="mt-2 text-xs leading-5 text-[#843528]" role="alert">{state.error}</p> : null}
    </div>
  );
}
