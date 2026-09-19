import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), search: vi.fn(), throttle: vi.fn(), event: { features: { playlist: true } } }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/music", () => ({ isMusicSearchConfigured: mocks.configured, searchMusic: mocks.search }));
vi.mock("../lib/server/music/rate-limit", () => ({ throttleMusicRequest: mocks.throttle }));
vi.mock("../lib/oyster-roast-event", () => ({ OYSTER_ROAST_EVENT: mocks.event }));
import { GET } from "../app/api/music/search/route";
import { MusicError } from "../lib/server/music/provider";
import { createMusicSearchClient } from "../lib/music-search-client";
import { attribution, track } from "./fixtures/music";

const result = { tracks: [track], attribution };
const request = (query: string) => new Request(`https://shindig.test/api/music/search?${new URLSearchParams({ q: query })}`);
beforeEach(() => { vi.resetAllMocks(); mocks.event.features.playlist = true; mocks.configured.mockReturnValue(true); mocks.search.mockResolvedValue(result); });
afterEach(() => vi.useRealTimers());

describe("Shindig music search API", () => {
  it("returns only the normalized public app contract after throttling", async () => {
    const response = await GET(request(" Lovely   Day "));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, ...result });
    expect(mocks.search).toHaveBeenCalledWith("Lovely Day");
    expect(mocks.throttle).toHaveBeenCalledWith("search", expect.any(Headers));
  });

  it.each(["", "ab", " a ! ? b ", "🎵🎵🎵", "x".repeat(101)])("rejects insignificant or overlong queries: %s", async (query) => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("respects the existing feature flag", async () => {
    mocks.event.features.playlist = false;
    expect((await GET(request("some song"))).status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("returns a graceful unavailable state without credentials", async () => {
    mocks.configured.mockReturnValue(false);
    const response = await GET(request("some song"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, message: expect.stringContaining("saved suggestions are still here") });
    expect(mocks.throttle).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("sends Retry-After for provider or local rate limits", async () => {
    mocks.throttle.mockRejectedValue(new MusicError("rate_limited", 25));
    const response = await GET(request("some song"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("25");
    expect(await response.json()).toMatchObject({ ok: false, retryAfter: 25 });
  });

  it("never returns credentials or raw database/provider errors", async () => {
    mocks.search.mockRejectedValue(new Error("postgresql://password and Spotify secret"));
    const response = await GET(request("some song"));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toMatch(/password|secret|postgresql/);
  });
});

describe("debounced browser search", () => {
  it("waits 400 ms, skips short queries, and calls only Shindig", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, ...result }));
    const client = createMusicSearchClient(fetcher);
    const update = vi.fn();
    client.run("ab", update);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).not.toHaveBeenCalled();
    const cancel = client.run("Lovely Day", update);
    await vi.advanceTimersByTimeAsync(399);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/music/search?q=Lovely+Day");
    expect(update).toHaveBeenLastCalledWith({ status: "success", result });
    cancel();
  });

  it("cancels pending searches and ignores stale responses", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const client = createMusicSearchClient(fetcher);
    const update = vi.fn();
    client.run("first song", update)();
    await vi.advanceTimersByTimeAsync(400);
    expect(fetcher).not.toHaveBeenCalled();
    const cancel = client.run("second song", update);
    await vi.advanceTimersByTimeAsync(400);
    cancel();
    resolve(Response.json({ ok: true, ...result }));
    await vi.advanceTimersByTimeAsync(1);
    expect(update).toHaveBeenCalledTimes(1); // loading only, never the stale result
  });

  it("respects a server cooldown even if the guest keeps typing", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, message: "Try shortly", retryAfter: 45 }, { status: 429, headers: { "Retry-After": "45" } }));
    const client = createMusicSearchClient(fetcher);
    const update = vi.fn();
    client.run("first song", update);
    await vi.advanceTimersByTimeAsync(400);
    client.run("second song", update);
    await vi.advanceTimersByTimeAsync(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith({ status: "error", message: expect.stringContaining("breather") });
  });

  it("handles network and malformed response failures", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(new Response("not json"));
    const client = createMusicSearchClient(fetcher);
    const update = vi.fn();
    client.run("first song", update);
    await vi.advanceTimersByTimeAsync(400);
    expect(update).toHaveBeenLastCalledWith({ status: "error", message: expect.stringContaining("saved suggestions") });
    client.run("second song", update);
    await vi.advanceTimersByTimeAsync(400);
    expect(update).toHaveBeenLastCalledWith({ status: "error", message: expect.stringContaining("saved suggestions") });
  });
});
