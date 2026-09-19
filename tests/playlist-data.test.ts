import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ neon: vi.fn(), sql: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));

import { createPlaylistSuggestion, deletePlaylistSuggestion, listPlaylistSuggestionsForAdmin, listPublicPlaylistSuggestions } from "../lib/server/playlist";
import { track, attribution, legacy } from "./fixtures/music";

const suggestion = { ...track, suggestedBy: null };
const publicFields = { key: "a9d6bde0-5a1a-43eb-8b11-aa058db98be4", applauseCount: 7, newestRank: 0 };
const id = "4f849d18-931b-42ef-a4d4-7ec07aa73b3d";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
  mocks.neon.mockReturnValue(mocks.sql);
});

describe("playlist data access", () => {
  it("uses the canonical event and a server-generated ID, with atomic duplicate protection", async () => {
    mocks.sql.mockResolvedValueOnce([{ inserted: 1 }]).mockResolvedValueOnce([]);
    await expect(createPlaylistSuggestion(suggestion)).resolves.toBe("added");
    await expect(createPlaylistSuggestion(suggestion)).resolves.toBe("duplicate");
    const [query, ...values] = mocks.sql.mock.calls[0];
    expect(query.join("?")).toContain("ON CONFLICT (event_slug, provider, provider_track_id) WHERE provider IS NOT NULL DO NOTHING");
    expect(values).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/), "oyster-roast-2026", track.provider, track.providerTrackId, track.songTitle, track.artist, track.album, track.artworkUrl, track.externalUrl, track.explicit, null]);
  });

  it("selects only public song fields and strips unexpected private fields", async () => {
    mocks.sql.mockResolvedValue([{ ...suggestion, ...publicFields, id, createdAt: "2026-09-19T12:00:00Z", privateNote: "secret", voter_token_hash: "private" }]);
    await expect(listPublicPlaylistSuggestions()).resolves.toEqual([{ ...suggestion, ...publicFields, attribution }]);
    const [parts, slug] = mocks.sql.mock.calls[0];
    expect(parts.join("?").split("FROM")[0]).not.toMatch(/\b(id|created_at|createdAt|privateNote)\b/);
    expect(slug).toBe("oyster-roast-2026");
  });

  it("returns IDs only through the separate admin query", async () => {
    mocks.sql.mockResolvedValue([{ ...suggestion, ...publicFields, id, createdAt: "2026-09-19T12:00:00Z" }]);
    await expect(listPlaylistSuggestionsForAdmin()).resolves.toEqual([{ ...suggestion, ...publicFields, attribution, id, createdAt: "2026-09-19T12:00:00.000Z" }]);
  });

  it("preserves legacy suggestions without calling the catalog or requiring credentials", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    mocks.sql.mockResolvedValue([{ key: legacy.key, songTitle: legacy.songTitle, artist: legacy.artist, suggestedBy: null }]);
    await expect(listPublicPlaylistSuggestions()).resolves.toEqual([legacy]);
  });

  it("scopes deletions to the known event and requested record", async () => {
    mocks.sql.mockResolvedValue([{ deleted: 1 }]);
    await expect(deletePlaylistSuggestion(id)).resolves.toBe(true);
    const [parts, ...values] = mocks.sql.mock.calls[0];
    expect(parts.join("?")).toContain("WHERE id = ?::uuid AND event_slug = ?");
    expect(values).toEqual([id, "oyster-roast-2026"]);
  });

  it("fails without a database instead of pretending to save", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(createPlaylistSuggestion(suggestion)).rejects.toThrow("not configured");
    expect(mocks.neon).not.toHaveBeenCalled();
  });
});
