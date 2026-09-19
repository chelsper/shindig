import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLAYLIST_LIMITS } from "../lib/playlist";
import { validatePlaylistSuggestion } from "../lib/server/playlist-validation";

const valid = { provider: "spotify", providerTrackId: "0123456789abcdefghijkL", suggestedBy: "  Chelsea  " };

describe("playlist input validation", () => {
  it("accepts only selection identifiers and a trimmed name, never arbitrary metadata", () => {
    expect(validatePlaylistSuggestion({ ...valid, songTitle: "Fake", artworkUrl: "https://evil.test", eventSlug: "another-event", id: "untrusted" })).toEqual({
      success: true, data: { ...valid, suggestedBy: "Chelsea" },
    });
  });

  it.each([undefined, null, "", "   "])("accepts an optional name: %s", (suggestedBy) => {
    expect(validatePlaylistSuggestion({ ...valid, suggestedBy })).toMatchObject({ success: true, data: { suggestedBy: null } });
  });

  it.each([null, [], "bad input", { songTitle: "Manual", artist: "Entry" }, { ...valid, provider: "" }, { ...valid, providerTrackId: "../other" }, { ...valid, providerTrackId: 2 }, { ...valid, suggestedBy: false }])("rejects invalid input: %j", (input) => {
    expect(validatePlaylistSuggestion(input).success).toBe(false);
  });

  it.each(["suggestedBy"] as const)("enforces the %s limit", (field) => {
    expect(validatePlaylistSuggestion({ ...valid, [field]: "x".repeat(PLAYLIST_LIMITS[field]) }).success).toBe(true);
    expect(validatePlaylistSuggestion({ ...valid, [field]: "x".repeat(PLAYLIST_LIMITS[field] + 1) }).success).toBe(false);
  });

  it("bounds provider identifiers", () => {
    expect(validatePlaylistSuggestion({ ...valid, provider: "a".repeat(33) }).success).toBe(false);
    expect(validatePlaylistSuggestion({ ...valid, providerTrackId: "a".repeat(129) }).success).toBe(false);
  });
});
