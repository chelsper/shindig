"use client";

import type { FormEvent } from "react";
import type { MusicAttribution, MusicTrack } from "../../lib/music";
import { PLAYLIST_LIMITS } from "../../lib/playlist";
import { TrackDetails } from "./track-details";

type SongConfirmationProps = {
  track: MusicTrack;
  attribution: MusicAttribution;
  suggestedBy: string;
  pending: boolean;
  error: string | null;
  onNameChange: (name: string) => void;
  onChangeSong: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function SongConfirmation({ track, attribution, suggestedBy, pending, error, onNameChange, onChangeSong, onSubmit }: SongConfirmationProps) {
  return (
    <form aria-label="Confirm song suggestion" aria-busy={pending} onSubmit={onSubmit}>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#355f9e]">Your song choice</p>
      <TrackDetails attribution={attribution} track={track} />
      <fieldset className="mt-4 min-w-0" disabled={pending}>
        <legend className="sr-only">Finish your song suggestion</legend>
        <label className="field-label">
          Your name (optional)
          <input aria-describedby="playlist-name-note" autoComplete="name" autoFocus className="field-input" maxLength={PLAYLIST_LIMITS.suggestedBy} name="suggestedBy" onChange={(event) => onNameChange(event.target.value)} value={suggestedBy} />
        </label>
        <p className="mt-2 text-xs leading-5 text-[#202523]/55" id="playlist-name-note">Get credit for your good taste. Your name will appear with the song, or leave it blank to stay anonymous.</p>
        {error ? <p className="mt-3 text-sm leading-6 text-[#843528]" role="alert">{error}</p> : null}
        <button className="primary-button mt-5 w-full" disabled={pending} type="submit">{pending ? "Adding your song…" : "Add to Playlist"}</button>
        <button className="mt-2 min-h-11 w-full text-sm font-semibold text-[#355f9e] underline underline-offset-4 disabled:opacity-50" disabled={pending} onClick={onChangeSong} type="button">Choose a different song</button>
      </fieldset>
    </form>
  );
}
