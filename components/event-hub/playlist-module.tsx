"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import { submitPlaylistSuggestion } from "../../app/event/playlist-actions";
import { PLAYLIST_LIMITS, type PublicPlaylistSuggestion } from "../../lib/playlist";

type PlaylistModuleProps = {
  suggestions: PublicPlaylistSuggestion[];
  unavailable?: boolean;
};

export function PlaylistModule({ suggestions, unavailable = false }: PlaylistModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [suggestedBy, setSuggestedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const suggestButton = useRef<HTMLButtonElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || unavailable) return;
    submitting.current = true;
    setError(null);
    setConfirmation(null);

    startTransition(async () => {
      try {
        const result = await submitPlaylistSuggestion({ songTitle, artist, suggestedBy });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        // The server action revalidates /event, returning the refreshed song list
        // in the same response. No database IDs need to enter client state.
        setConfirmation(result.outcome === "added"
          ? "That’s a shuckin’ good pick! Your song is on the list."
          : "That song’s already on the list. Great minds shuck alike!");
        setSongTitle("");
        setArtist("");
        setSuggestedBy("");
        setShowForm(false);
        suggestButton.current?.focus();
      } catch {
        setError("We couldn’t add your song. Please try again in a moment.");
      } finally {
        submitting.current = false;
      }
    });
  }

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
          onClick={() => { setShowForm(!showForm); setError(null); setConfirmation(null); }}
          ref={suggestButton}
          type="button"
        >
          + Suggest a Song
        </button>
      </div>

      {confirmation ? <p className="mt-5 rounded-xl border border-[#285630]/15 bg-[#edf7ed] px-4 py-3 text-sm leading-6 text-[#285630]" role="status">{confirmation}</p> : null}

      <div id="playlist-suggestion-form" hidden={!showForm}>
        {showForm ? (
          <form className="mt-5 rounded-2xl border border-[#355f9e]/15 bg-[#fffaf1]/85 p-4 sm:p-5" onSubmit={handleSubmit}>
            <fieldset className="space-y-4" disabled={isPending}>
              <legend className="sr-only">Suggest a song</legend>
              <label className="field-label">
                Song
                <input autoFocus className="field-input" maxLength={PLAYLIST_LIMITS.songTitle} name="songTitle" onChange={(event) => setSongTitle(event.target.value)} required value={songTitle} />
              </label>
              <label className="field-label">
                Artist
                <input className="field-input" maxLength={PLAYLIST_LIMITS.artist} name="artist" onChange={(event) => setArtist(event.target.value)} required value={artist} />
              </label>
              <label className="field-label">
                Your name (optional)
                <input aria-describedby="playlist-name-note" autoComplete="name" className="field-input" maxLength={PLAYLIST_LIMITS.suggestedBy} name="suggestedBy" onChange={(event) => setSuggestedBy(event.target.value)} value={suggestedBy} />
              </label>
              <p className="text-xs leading-5 text-[#202523]/55" id="playlist-name-note">If you add your name, it will appear with your song.</p>
              {error ? <p className="text-sm leading-6 text-[#843528]" role="alert">{error}</p> : null}
              <button className="primary-button w-full" disabled={isPending} type="submit">{isPending ? "Adding your song…" : "Add to Playlist"}</button>
            </fieldset>
          </form>
        ) : null}
      </div>

      {unavailable ? (
        <p className="py-9 text-center text-sm leading-6 text-[#202523]/65">The playlist is taking a quick break. Please check back soon.</p>
      ) : suggestions.length === 0 ? (
        <p className="px-2 py-10 text-center font-serif text-2xl leading-snug text-[#202523]/70">No requests yet. Be the first to pick something.</p>
      ) : (
        <ol aria-label="Song suggestions" className="mt-2 divide-y divide-[#202523]/8">
          {suggestions.map((suggestion, index) => (
            <li className="flex gap-4 py-5" key={`${suggestion.songTitle}-${suggestion.artist}`}>
              <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-[#355f9e]/15 bg-[#e9f2f8]/65 font-serif text-sm text-[#355f9e]">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 break-words">
                <p className="font-serif text-xl leading-tight sm:text-2xl">{suggestion.songTitle}</p>
                <p className="mt-1 text-sm text-[#202523]/70">{suggestion.artist}</p>
                {suggestion.suggestedBy ? <p className="mt-2 text-xs leading-5 text-[#202523]/55">Suggested by {suggestion.suggestedBy}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
