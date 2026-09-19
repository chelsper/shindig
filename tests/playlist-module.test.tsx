import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));

import { PlaylistModule } from "../components/event-hub/playlist-module";
import { EventModules } from "../components/event-hub/event-modules";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { MusicSearch, MusicSearchResults } from "../components/music/music-search";
import { SongConfirmation } from "../components/music/song-confirmation";
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
    const html = renderToStaticMarkup(<MusicSearch onSelect={vi.fn()} />);
    expect(html).toContain("Search for a song");
    expect(html).toContain('type="search"');
    expect(html).not.toContain('name="songTitle"');
    expect(html).not.toContain('name="artist"');
  });

  it("shows linked original artwork, full attribution, metadata, and an explicit label", () => {
    const html = renderToStaticMarkup(<MusicSearchResults onSelect={vi.fn()} result={{ tracks: [{ ...track, explicit: true }], attribution }} />);
    for (const value of [track.songTitle, track.artist, track.album!, track.artworkUrl!, track.externalUrl, attribution.logoUrl, "Explicit", "Choose"]) expect(html).toContain(value);
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).not.toContain("/_next/image");
  });

  it("handles missing artwork and offers selection rather than immediate submission", () => {
    const html = renderToStaticMarkup(<MusicSearchResults onSelect={vi.fn()} result={{ tracks: [{ ...track, artworkUrl: null }], attribution }} />);
    expect(html).toContain("♪");
    expect(html).not.toContain("i.scdn.co");
    expect(html).toContain(`Choose ${track.songTitle} by ${track.artist}`);
    expect(html).toContain('type="button"');
    expect(html).not.toContain('type="submit"');
  });

  it("keeps both saved catalog and legacy tracks visible without search credentials", () => {
    const html = renderToStaticMarkup(<PlaylistModule suggestions={[legacy, { ...track, attribution, suggestedBy: "Chelsea" }]} />);
    expect(html).toContain(legacy.songTitle);
    expect(html).toContain(track.songTitle);
    expect(html).toContain("Suggested by Chelsea");
  });
});

describe("song confirmation step", () => {
  const props = { track, attribution, suggestedBy: "", pending: false, error: null, onSubmit: vi.fn(), onNameChange: vi.fn(), onChangeSong: vi.fn() };

  it("shows the selected song and an optional name before the actual Add to Playlist button", () => {
    const html = renderToStaticMarkup(<SongConfirmation {...props} />);
    expect(html).toContain(track.songTitle);
    expect(html).toContain(attribution.logoUrl);
    expect(html).toContain('name="suggestedBy"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain("Your name (optional)");
    expect(html).toContain("leave it blank to stay anonymous");
    expect(html).toContain('type="submit"');
    expect(html).toContain("Add to Playlist");
    expect(html.indexOf('name="suggestedBy"')).toBeLessThan(html.indexOf("Add to Playlist"));
    expect(html).not.toContain('required=""');
  });

  it("keeps the typed name and chosen track visible when a save fails", () => {
    const html = renderToStaticMarkup(<SongConfirmation {...props} suggestedBy="Chelsea" error="Please try again." />);
    expect(html).toContain('value="Chelsea"');
    expect(html).toContain(track.songTitle);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Please try again.");
    expect(html).not.toContain('disabled=""');
  });

  it("offers a non-submitting way to choose another song", () => {
    const html = renderToStaticMarkup(<SongConfirmation {...props} />);
    expect(html).toMatch(/type="button">Choose a different song/);
  });

  it("disables name entry and both confirmation actions during submission", () => {
    const html = renderToStaticMarkup(<SongConfirmation {...props} pending />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain("Adding your song…");
  });
});
