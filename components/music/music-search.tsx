"use client";

import { useEffect, useState } from "react";
import { hasMeaningfulMusicQuery, MUSIC_SEARCH, normalizeMusicQuery, type MusicAttribution, type MusicSearchResult, type MusicTrack } from "../../lib/music";
import { createMusicSearchClient, type MusicSearchState } from "../../lib/music-search-client";
import { TrackDetails } from "./track-details";

type MusicSearchProps = { onSelect: (track: MusicTrack, attribution: MusicAttribution) => void };

export function MusicSearchResults({ result, onSelect }: MusicSearchProps & {
  result: MusicSearchResult;
}) {
  return result.tracks.length === 0 ? <p className="py-5 text-sm leading-6">No songs found. Try another title or artist.</p> : (
    <ul aria-label="Music search results" className="divide-y divide-[#202523]/10">
      {result.tracks.map((track) => {
        const key = `${track.provider}:${track.providerTrackId}`;
        return <li className="py-5" key={key}>
          <TrackDetails attribution={result.attribution} track={track} action={
            <button aria-label={`Choose ${track.songTitle} by ${track.artist}`} className="min-h-11 shrink-0 rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/80 px-4 text-sm font-semibold text-[#214e91] transition hover:border-[#355f9e]" onClick={() => onSelect(track, result.attribution)} type="button">Choose</button>
          } />
        </li>;
      })}
    </ul>
  );
}

export function MusicSearch({ onSelect }: MusicSearchProps) {
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<MusicSearchState>({ status: "idle" });
  const [client] = useState(() => createMusicSearchClient());
  useEffect(() => client.run(query, setState), [client, query, revision]);
  return (
    <div>
      <label className="field-label">
        Search for a song
        <input aria-describedby="music-search-help" autoComplete="off" autoFocus className="field-input" maxLength={MUSIC_SEARCH.maxCharacters} onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setState({ status: hasMeaningfulMusicQuery(normalizeMusicQuery(value)) ? "waiting" : "idle" });
        }} placeholder="Song title or artist" type="search" value={query} />
      </label>
      <p className="mt-2 text-xs leading-5 text-[#202523]/60" id="music-search-help">Type at least 3 letters or numbers. Choose a song, then add your name if you’d like.</p>
      <div aria-atomic="true" aria-live="polite" className="mt-3 text-sm leading-6">
        {state.status === "waiting" || state.status === "loading" ? "Finding your soundtrack…" : null}
        {state.status === "success" ? <span className="sr-only">{state.result.tracks.length} songs found.</span> : null}
        {state.status === "error" ? <p className="text-[#843528]">{state.message}</p> : null}
      </div>
      {state.status === "error" ? <button className="min-h-11 text-sm font-semibold text-[#355f9e] underline underline-offset-4" onClick={() => { setState({ status: "waiting" }); setRevision((value) => value + 1); }} type="button">Try search again</button> : null}
      {state.status === "success" ? <MusicSearchResults onSelect={onSelect} result={state.result} /> : null}
    </div>
  );
}
