"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import { submitPlaylistSuggestion } from "../../app/event/playlist-actions";
import type { PublicPlaylistSuggestion } from "../../lib/playlist";
import type { MusicAttribution, MusicTrack } from "../../lib/music";
import { MusicSearch } from "../music/music-search";
import { SongConfirmation } from "../music/song-confirmation";
import { TrackDetails } from "../music/track-details";

type PlaylistModuleProps = {
  suggestions: PublicPlaylistSuggestion[];
  unavailable?: boolean;
};

export function PlaylistModule({ suggestions, unavailable = false }: PlaylistModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [selection, setSelection] = useState<{ track: MusicTrack; attribution: MusicAttribution } | null>(null);
  const [page, setPage] = useState(0);
  const [suggestedBy, setSuggestedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const suggestButton = useRef<HTMLButtonElement>(null);

  function handleSelect(track: MusicTrack, attribution: MusicAttribution) {
    if (submitting.current || unavailable) return;
    // Selecting only opens the review/name step. Nothing is saved yet.
    setSelection({ track, attribution });
    setError(null);
    setConfirmation(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || submitting.current || unavailable) return;
    const { track } = selection;
    submitting.current = true;
    setError(null);
    setConfirmation(null);

    startTransition(async () => {
      try {
        const result = await submitPlaylistSuggestion({ provider: track.provider, providerTrackId: track.providerTrackId, suggestedBy });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        // The server action revalidates /event, returning the refreshed song list
        // in the same response. No database IDs need to enter client state.
        setConfirmation(result.outcome === "added"
          ? "That’s a shuckin’ good pick! Your song is on the list."
          : "Already on the Shindig playlist 🎵");
        setPage(0);
        setSuggestedBy("");
        setSelection(null);
        setShowForm(false);
        suggestButton.current?.focus();
      } catch {
        setError("We couldn’t add your song. Please try again in a moment.");
      } finally {
        submitting.current = false;
      }
    });
  }

  // Keep each browsable set within the catalog's 20-item display guidance.
  const currentPage = Math.min(page, Math.max(0, Math.ceil(suggestions.length / 20) - 1));
  const visibleSuggestions = suggestions.slice(currentPage * 20, (currentPage + 1) * 20);

  return (
    <section aria-labelledby="playlist-heading" className="rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
      <div className="border-b border-[#202523]/10 pb-5">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">A soundtrack, together</p>
        <h2 id="playlist-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">Shuckin&apos; Playlist</h2>
        <p className="mt-2 text-sm text-[#202523]/65">Help us pick the soundtrack.</p>
        <button
          aria-controls="playlist-suggestion-form"
          aria-expanded={showForm}
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/80 px-5 text-sm font-semibold text-[#214e91] transition hover:border-[#355f9e] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={unavailable || isPending}
          onClick={() => { setShowForm(!showForm); setSelection(null); setError(null); setConfirmation(null); }}
          ref={suggestButton}
          type="button"
        >
          + Suggest a Song
        </button>
      </div>

      {confirmation ? <p className="mt-5 rounded-xl border border-[#285630]/15 bg-[#edf7ed] px-4 py-3 text-sm leading-6 text-[#285630]" role="status">{confirmation}</p> : null}

      <div id="playlist-suggestion-form" hidden={!showForm}>
        {showForm ? (
          <div className="mt-5 rounded-2xl border border-[#355f9e]/15 bg-[#fffaf1]/85 p-4 sm:p-5">
            {selection ? (
              <SongConfirmation
                attribution={selection.attribution}
                error={error}
                onChangeSong={() => { if (!submitting.current) { setSelection(null); setError(null); } }}
                onNameChange={setSuggestedBy}
                onSubmit={handleSubmit}
                pending={isPending}
                suggestedBy={suggestedBy}
                track={selection.track}
              />
            ) : <MusicSearch onSelect={handleSelect} />}
          </div>
        ) : null}
      </div>

      {unavailable ? (
        <p className="py-9 text-center text-sm leading-6 text-[#202523]/65">The playlist is taking a quick break. Please check back soon.</p>
      ) : suggestions.length === 0 ? (
        <p className="px-2 py-10 text-center font-serif text-2xl leading-snug text-[#202523]/70">No requests yet. Be the first to pick something.</p>
      ) : (
        <>
          <ol aria-label="Song suggestions" className="mt-2 divide-y divide-[#202523]/8">
            {visibleSuggestions.map((suggestion) => (
              <li className="py-5" key={suggestion.providerTrackId ? `${suggestion.provider}:${suggestion.providerTrackId}` : `${suggestion.songTitle}-${suggestion.artist}`}>
                <TrackDetails attribution={suggestion.attribution} track={suggestion} />
                {suggestion.suggestedBy ? <p className="mt-2 break-words text-xs leading-5 text-[#202523]/55">Suggested by {suggestion.suggestedBy}</p> : null}
              </li>
            ))}
          </ol>
          {suggestions.length > 20 ? <nav aria-label="Playlist pages" className="flex items-center justify-between gap-3 border-t border-[#202523]/10 pt-3 text-sm">
            <button className="min-h-11 px-2 text-[#355f9e] disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} type="button">Previous</button>
            <span>{currentPage + 1} / {Math.ceil(suggestions.length / 20)}</span>
            <button className="min-h-11 px-2 text-[#355f9e] disabled:opacity-40" disabled={(currentPage + 1) * 20 >= suggestions.length} onClick={() => setPage(currentPage + 1)} type="button">Next</button>
          </nav> : null}
        </>
      )}
    </section>
  );
}
