import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLAYLIST_LIMITS } from "../lib/playlist";
import { validatePlaylistSuggestion } from "../lib/server/playlist-validation";

const valid = { songTitle: "  Lovely   Day ", artist: " Bill Withers ", suggestedBy: "  Chelsea  " };

describe("playlist input validation", () => {
  it("trims and normalizes text, accepting only the three public fields", () => {
    expect(validatePlaylistSuggestion({ ...valid, eventSlug: "another-event", id: "untrusted" })).toEqual({
      success: true, data: { songTitle: "Lovely Day", artist: "Bill Withers", suggestedBy: "Chelsea" },
    });
  });

  it.each([undefined, null, "", "   "])("accepts an optional name: %s", (suggestedBy) => {
    expect(validatePlaylistSuggestion({ ...valid, suggestedBy })).toMatchObject({ success: true, data: { suggestedBy: null } });
  });

  it.each([null, [], "bad input", { ...valid, songTitle: "  " }, { ...valid, artist: "\n" }, { ...valid, songTitle: 2 }, { ...valid, suggestedBy: false }])("rejects invalid input: %j", (input) => {
    expect(validatePlaylistSuggestion(input).success).toBe(false);
  });

  it.each(["songTitle", "artist", "suggestedBy"] as const)("enforces the %s limit", (field) => {
    expect(validatePlaylistSuggestion({ ...valid, [field]: "x".repeat(PLAYLIST_LIMITS[field]) }).success).toBe(true);
    expect(validatePlaylistSuggestion({ ...valid, [field]: "x".repeat(PLAYLIST_LIMITS[field] + 1) }).success).toBe(false);
  });
});
