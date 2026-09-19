// The public application contract. No provider SDKs, credentials, or API shapes.
export type MusicAttribution = { name: string; logoUrl: string; logoWidth: number; logoHeight: number; browseUrl: string };
export type MusicTrack = {
  provider: string;
  providerTrackId: string;
  songTitle: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  externalUrl: string;
  explicit: boolean | null;
};
export type MusicSearchResult = { tracks: MusicTrack[]; attribution: MusicAttribution };
export type MusicSearchResponse = ({ ok: true } & MusicSearchResult) | { ok: false; message: string; retryAfter?: number };

export const MUSIC_SEARCH = { minCharacters: 3, maxCharacters: 100, limit: 5, debounceMs: 400 } as const;
export function normalizeMusicQuery(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " "); }
export function hasMeaningfulMusicQuery(value: string) { return (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= MUSIC_SEARCH.minCharacters; }
