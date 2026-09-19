import type { MusicAttribution, MusicTrack } from "../../lib/music";
import type { PublicPlaylistSuggestion } from "../../lib/playlist";

export const attribution: MusicAttribution = { name: "Spotify", logoUrl: "/music/spotify-logo-black.svg", logoWidth: 96, logoHeight: 26, browseUrl: "https://open.spotify.com/" };
export const track: MusicTrack = {
  provider: "spotify", providerTrackId: "0123456789abcdefghijkL", songTitle: "Lovely Day", artist: "Bill Withers",
  album: "Test Album", artworkUrl: "https://i.scdn.co/image/abc123", externalUrl: "https://open.spotify.com/track/0123456789abcdefghijkL", explicit: false,
};
export const legacy: PublicPlaylistSuggestion = {
  key: "c9d6bde0-5a1a-43eb-8b11-aa058db98be4", applauseCount: 0, newestRank: 0,
  songTitle: "Legacy Song", artist: "Legacy Artist", suggestedBy: null,
  provider: null, providerTrackId: null, album: null, artworkUrl: null, externalUrl: null, explicit: null, attribution: null,
};
export const spotifyTrack = {
  id: track.providerTrackId, type: "track", name: track.songTitle, artists: [{ name: track.artist }],
  album: { name: track.album, images: [{ url: track.artworkUrl }] }, explicit: track.explicit,
};
