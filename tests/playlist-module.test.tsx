import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));

import { PlaylistModule } from "../components/event-hub/playlist-module";
import { EventModules } from "../components/event-hub/event-modules";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

describe("public Playlist module", () => {
  it("shows the requested empty state and suggestion action", () => {
    const html = renderToStaticMarkup(<PlaylistModule suggestions={[]} />);
    expect(html).toContain("No requests yet. Be the first to pick something.");
    expect(html).toContain("+ Suggest a Song");
    expect(html).toContain("Help us pick the soundtrack.");
  });

  it("only renders song, artist, and an optional public name; escaping user text", () => {
    const suggestions = [
      { songTitle: "<script>alert(1)</script>", artist: "Artist", suggestedBy: "Guest", id: "secret-id", createdAt: "private-time" },
      { songTitle: "Another Song", artist: "Another Artist", suggestedBy: null },
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
      playlistSuggestions={[{ songTitle: "Hidden Song", artist: "Hidden Artist", suggestedBy: "Hidden Name" }]}
    />);
    for (const text of ["hub-tab-playlist", "playlist-heading", "Hidden Song", "Hidden Artist", "Hidden Name", "Suggest a Song"]) {
      expect(html).not.toContain(text);
    }
  });
});
