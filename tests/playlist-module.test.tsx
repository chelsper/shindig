import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));

import { PlaylistModule } from "../components/event-hub/playlist-module";
import { EventModules } from "../components/event-hub/event-modules";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { MusicSearch, MusicSearchResults } from "../components/music/music-search";
import { attribution, legacy, track } from "./fixtures/music";

describe("public Playlist module", () => {
  it("shows the requested empty state and suggestion action", () => {
    const html = renderToStaticMarkup(<PlaylistModule suggestions={[]} />);
    expect(html).toContain("No requests yet. Be the first to pick something.");
    expect(html).toContain("+ Suggest a Song");
    expect(html).toContain("Help us pick the soundtrack.");
  });

  it("only renders song, artist, and an optional public name; escaping user text", () => {
    const suggestions = [
      { ...legacy, songTitle: "<script>alert(1)</script>", artist: "Artist", suggestedBy: "Guest", id: "secret-id", createdAt: "private-time" },
      { ...legacy, songTitle: "Another Song", artist: "Another Artist", suggestedBy: null },
    ];
    const html = renderToStaticMarkup(<PlaylistModule suggestions={suggestions} />);
    expect(html).toContain("Suggested by Guest");
    expect(html.match(/Suggested by/g)).toHaveLength(1);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("secret-id");
    expect(html).not.toContain("private-time");
  });

  it("shows an unavailable state instead of a misleading empty list", () => {
    const html = renderToStaticMarkup(<PlaylistModule suggestions={[]} unavailable />);
    expect(html).toContain("The playlist is taking a quick break.");
    expect(html).not.toContain("No requests yet.");
    expect(html).toContain('disabled=""');
  });

  it("removes the tab, form, and song data when the feature is disabled", () => {
    const html = renderToStaticMarkup(<EventModules
      features={{ ...OYSTER_ROAST_EVENT.features, playlist: false }}
      guestList={null}
      playlistSuggestions={[{ ...legacy, songTitle: "Hidden Song", artist: "Hidden Artist", suggestedBy: "Hidden Name" }]}
    />);
    for (const text of ["hub-tab-playlist", "playlist-heading", "Hidden Song", "Hidden Artist", "Hidden Name", "Suggest a Song"]) {
      expect(html).not.toContain(text);
    }
  });

  it("provides catalog search, not manual title and artist inputs", () => {
    const html = renderToStaticMarkup(<MusicSearch onSelect={vi.fn()} pending={null} />);
    expect(html).toContain("Search for a song");
    expect(html).toContain('type="search"');
    expect(html).not.toContain('name="songTitle"');
    expect(html).not.toContain('name="artist"');
  });

  it("shows linked original artwork, full attribution, metadata, and an explicit label", () => {
    const html = renderToStaticMarkup(<MusicSearchResults onSelect={vi.fn()} pending={null} result={{ tracks: [{ ...track, explicit: true }], attribution }} />);
    for (const value of [track.songTitle, track.artist, track.album!, track.artworkUrl!, track.externalUrl, attribution.logoUrl, "Explicit", "Add"]) expect(html).toContain(value);
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).not.toContain("/_next/image");
  });

  it("handles missing artwork and disables all adds while one selection is saving", () => {
    const html = renderToStaticMarkup(<MusicSearchResults onSelect={vi.fn()} pending={`${track.provider}:${track.providerTrackId}`} result={{ tracks: [{ ...track, artworkUrl: null }], attribution }} />);
    expect(html).toContain("♪");
    expect(html).not.toContain("i.scdn.co");
    expect(html).toContain("Adding…");
    expect(html).toContain('disabled=""');
  });

  it("keeps both saved catalog and legacy tracks visible without search credentials", () => {
    const html = renderToStaticMarkup(<PlaylistModule suggestions={[legacy, { ...track, attribution, suggestedBy: "Chelsea" }]} />);
    expect(html).toContain(legacy.songTitle);
    expect(html).toContain(track.songTitle);
    expect(html).toContain("Suggested by Chelsea");
  });
});
