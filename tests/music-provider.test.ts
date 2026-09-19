import { beforeEach, describe, expect, it, vi } from "vitest";

const quota = vi.hoisted(() => ({ consume: vi.fn(), block: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/music/rate-limit", () => ({ consumeMusicQuota: quota.consume, blockMusicProvider: quota.block }));
import { createSpotifyProvider, normalizeSpotifyTrack } from "../lib/server/music/spotify";
import { createMusicCatalog } from "../lib/server/music/catalog";
import { MusicError, type MusicProvider } from "../lib/server/music/provider";
import { attribution, spotifyTrack, track } from "./fixtures/music";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });
const token = () => json({ access_token: "server-only-test-token", expires_in: 3600 });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test-id");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-secret");
  vi.stubEnv("SPOTIFY_MARKET", "US");
});

describe("Spotify server provider", () => {
  it("uses app-only client credentials, a US track search, and a cached token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockImplementation(async () => json({ tracks: { items: [spotifyTrack] } }));
    const provider = createSpotifyProvider(fetcher);
    await expect(provider.search("Lovely Day")).resolves.toEqual([track]);
    await provider.search("another song");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]).toEqual(["https://accounts.spotify.com/api/token", expect.objectContaining({ method: "POST", body: "grant_type=client_credentials", cache: "no-store", redirect: "error", headers: { Authorization: `Basic ${Buffer.from("test-id:test-secret").toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" } })]);
    const url = new URL(String(fetcher.mock.calls[1][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Lovely Day", type: "track", limit: "5", market: "US" });
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({ Authorization: "Bearer server-only-test-token" });
    expect(JSON.stringify(await provider.search("another song"))).not.toContain("server-only-test-token");
  });

  it("looks up a selected stable ID through the single-track endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(json(spotifyTrack));
    await expect(createSpotifyProvider(fetcher).getTrack(track.providerTrackId)).resolves.toEqual(track);
    expect(fetcher.mock.calls[1][0]).toBe(`https://api.spotify.com/v1/tracks/${track.providerTrackId}?market=US`);
  });

  it("refreshes an expired token and retries an unauthorized token only once", async () => {
    let time = 0;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(token()).mockResolvedValueOnce(json(spotifyTrack));
    const provider = createSpotifyProvider(fetcher, () => time);
    await provider.getTrack(track.providerTrackId);
    expect(fetcher).toHaveBeenCalledTimes(4);
    time = 3600000;
    fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(json(spotifyTrack));
    await provider.getTrack(track.providerTrackId);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it.each([401, 403, 500, 503])("turns HTTP %s into a safe provider error", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValue(json({ error: "private provider details" }, status));
    await expect(createSpotifyProvider(fetcher).search("some song")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("honors Retry-After locally and across instances instead of retrying Spotify immediately", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(json({}, 429, { "Retry-After": "45" }));
    const provider = createSpotifyProvider(fetcher, () => 0);
    await expect(provider.search("some song")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 45 });
    await expect(provider.search("other song")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 45 });
    expect(quota.block).toHaveBeenCalledWith("spotify", 45);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses a bounded cooldown when a quota response has no Retry-After", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { reason: "QUOTA_EXCEEDED" } }, 429));
    await expect(createSpotifyProvider(fetcher).search("some song")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 60 });
  });

  it("does not call Spotify if the shared app-wide throttle is exhausted", async () => {
    quota.consume.mockRejectedValue(new MusicError("rate_limited", 20));
    const fetcher = vi.fn<typeof fetch>();
    await expect(createSpotifyProvider(fetcher).search("some song")).rejects.toMatchObject({ code: "rate_limited" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("handles network failures without leaking details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret upstream detail"));
    await expect(createSpotifyProvider(fetcher).search("some song")).rejects.toThrow("unavailable");
  });

  it("rejects missing configuration and invalid track IDs without an outbound call", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    const fetcher = vi.fn<typeof fetch>();
    const provider = createSpotifyProvider(fetcher);
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.search("some song")).rejects.toMatchObject({ code: "unavailable" });
    await expect(provider.getTrack("../evil")).rejects.toMatchObject({ code: "not_found" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("filters malformed and duplicate results and limits the result set to five", async () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ ...spotifyTrack, id: String(index).repeat(22) }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValue(json({ tracks: { items: [{}, items[0], ...items] } }));
    const results = await createSpotifyProvider(fetcher).search("some song");
    expect(results).toHaveLength(5);
    expect(new Set(results.map((item) => item.providerTrackId)).size).toBe(5);
  });

  it("preserves metadata and safely handles missing artwork or explicit metadata", () => {
    expect(normalizeSpotifyTrack({ ...spotifyTrack, explicit: undefined, album: { name: "Album", images: [] } })).toMatchObject({ artworkUrl: null, album: "Album", explicit: null });
    expect(normalizeSpotifyTrack({ ...spotifyTrack, album: { images: [{ url: "https://evil.test/image" }] } })).toMatchObject({ artworkUrl: null });
    expect(normalizeSpotifyTrack({ ...spotifyTrack, artists: [{ name: "One" }, { name: "Two" }], name: "Original  Spacing" })).toMatchObject({ artist: "One, Two", songTitle: "Original  Spacing" });
    expect(normalizeSpotifyTrack({ ...spotifyTrack, is_local: true })).toBeNull();
    expect(normalizeSpotifyTrack({ ...spotifyTrack, name: "x".repeat(513) })).toBeNull();
  });
});

describe("provider-neutral catalog cache", () => {
  function fakeProvider(): MusicProvider {
    return { id: "test", attribution, isConfigured: () => true, isTrackId: () => true, search: vi.fn().mockResolvedValue([track]), getTrack: vi.fn().mockResolvedValue(track) };
  }

  it("coalesces equivalent queries and reuses server-verified result metadata for selection", async () => {
    const provider = fakeProvider();
    const catalog = createMusicCatalog(provider);
    await Promise.all([catalog.search(" Lovely   Day "), catalog.search("lovely day")]);
    expect(provider.search).toHaveBeenCalledTimes(1);
    await expect(catalog.getTrack(track.providerTrackId)).resolves.toEqual(track);
    expect(provider.getTrack).not.toHaveBeenCalled();
  });

  it("expires cached metadata after five minutes", async () => {
    let time = 0;
    const provider = fakeProvider();
    const catalog = createMusicCatalog(provider, () => time);
    await catalog.search("Lovely Day");
    time = 300001;
    await catalog.search("Lovely Day");
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it("never caches failed searches", async () => {
    const provider = fakeProvider();
    vi.mocked(provider.search).mockRejectedValueOnce(new MusicError("unavailable"));
    const catalog = createMusicCatalog(provider);
    await expect(catalog.search("Lovely Day")).rejects.toThrow();
    await expect(catalog.search("Lovely Day")).resolves.toMatchObject({ tracks: [track] });
    expect(provider.search).toHaveBeenCalledTimes(2);
  });
});
