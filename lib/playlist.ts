import type { MusicAttribution, MusicTrack } from "./music";

export const PLAYLIST_LIMITS = { suggestedBy: 80 } as const;

export type PlaylistSelection = {
  provider: string;
  providerTrackId: string;
  suggestedBy: string | null;
};

export type CatalogSuggestion = MusicTrack & { suggestedBy: string | null };

export type PublicPlaylistSuggestion = Omit<MusicTrack, "provider" | "providerTrackId" | "externalUrl"> & {
  key: string;
  applauseCount: number;
  newestRank: number;
  provider: string | null;
  providerTrackId: string | null;
  externalUrl: string | null;
  attribution: MusicAttribution | null;
  suggestedBy: string | null;
};

export type PlaylistSort = "popular" | "newest";
export function sortPlaylist(suggestions: PublicPlaylistSuggestion[], order: PlaylistSort): PublicPlaylistSuggestion[] {
  return [...suggestions].sort((a, b) => (order === "popular" ? b.applauseCount - a.applauseCount : 0) || a.newestRank - b.newestRank || a.key.localeCompare(b.key));
}
