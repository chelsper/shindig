export const PLAYLIST_LIMITS = {
  songTitle: 160,
  artist: 120,
  suggestedBy: 80,
} as const;

export type PublicPlaylistSuggestion = {
  songTitle: string;
  artist: string;
  suggestedBy: string | null;
};
