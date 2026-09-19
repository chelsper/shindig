"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import type { MusicAttribution, MusicTrack } from "../../lib/music";

type TrackDetailsProps = {
  track: Pick<MusicTrack, "songTitle" | "artist" | "album" | "artworkUrl" | "explicit"> & { externalUrl: string | null };
  attribution: MusicAttribution | null;
  action?: ReactNode;
};

export function TrackDetails({ track, attribution, action }: TrackDetailsProps) {
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null);
  const details = (
    <>
      {track.artworkUrl && track.artworkUrl !== failedArtwork ? (
        <Image alt="" className="size-16 shrink-0 rounded-[4px] object-contain lg:rounded-[8px]" height={64} onError={() => setFailedArtwork(track.artworkUrl)} src={track.artworkUrl} unoptimized width={64} />
      ) : (
        <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-[4px] border border-[#355f9e]/10 bg-[#e9f2f8]/65 font-serif text-2xl text-[#355f9e]">♪</span>
      )}
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
        <span className="block font-serif text-xl leading-snug">{track.songTitle}</span>
        <span className="mt-1 block text-sm text-[#202523]/75">{track.artist}</span>
        {track.album ? <span className="mt-1 block text-xs leading-5 text-[#202523]/60">{track.album}</span> : null}
        {track.explicit ? <span className="mt-1 inline-block rounded border border-[#202523]/20 px-1 text-[0.65rem] leading-4">Explicit</span> : null}
      </span>
    </>
  );
  return (
    <div className="min-w-0 flex-1">
      {track.externalUrl ? (
        <a className="flex min-w-0 gap-3 rounded outline-offset-4 hover:underline" href={track.externalUrl} rel="noopener noreferrer" target="_blank">{details}<span className="sr-only"> — Open in {attribution?.name ?? "music catalog"} (new tab)</span></a>
      ) : <div className="flex min-w-0 gap-3">{details}</div>}
      {attribution || action ? <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        {attribution ? (
          <a aria-label={`Open in ${attribution.name} (new tab)`} className="inline-flex min-h-11 items-center p-3.5" href={track.externalUrl ?? attribution.browseUrl} rel="noopener noreferrer" target="_blank">
            <Image alt={attribution.name} className="h-auto" height={attribution.logoHeight} src={attribution.logoUrl} unoptimized width={attribution.logoWidth} />
          </a>
        ) : null}
        {action}
      </div> : null}
    </div>
  );
}
