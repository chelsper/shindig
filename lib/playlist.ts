import type { MusicAttribution, MusicTrack } from "./music";

export const PLAYLIST_LIMITS = { suggestedBy: 80 } as const;

export type PlaylistSelection = {
  provider: string;
  providerTrackId: string;
  suggestedBy: string | null;
};

export type CatalogSuggestion = MusicTrack & { suggestedBy: string | null };

export type PublicPlaylistSuggestion = Omit<MusicTrack, "provider" | "providerTrackId" | "externalUrl"> & {
  provider: string | null;
  providerTrackId: string | null;
  externalUrl: string | null;
  attribution: MusicAttribution | null;
  suggestedBy: string | null;
};
