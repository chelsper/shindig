import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const address = "4600 Silver Hill Rd, Washington, DC 20233";
const match = { matchedAddress: "4600 SILVER HILL RD, WASHINGTON, DC, 20233", coordinates: { x: -76.927, y: 38.846 }, privateProviderData: "not returned" };
const response = () => new Response(JSON.stringify({ result: { addressMatches: [match] } }));
beforeEach(() => { vi.resetModules(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response())); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-09T12:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("server-only Census address matcher", () => {
  it("uses a fixed HTTPS endpoint and returns only minimal confirmed-match candidates", async () => {
    const { searchAddress } = await import("../lib/server/address-search");
    expect(await searchAddress(address)).toEqual([{ matchedAddress: match.matchedAddress, latitude: 38.846, longitude: -76.927 }]);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?");
    expect(new URL(String(url)).searchParams.get("address")).toBe(address);
    expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("coalesces requests and caches repeated addresses for only 15 minutes", async () => {
    const { searchAddress } = await import("../lib/server/address-search");
    await Promise.all([searchAddress(address), searchAddress(address)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await searchAddress(address.toLowerCase()); expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 16 * 60_000);
    vi.mocked(fetch).mockResolvedValue(response());
    await searchAddress(address); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects overlong/invalid addresses without sending them", async () => {
    const { searchAddress } = await import("../lib/server/address-search");
    for (const input of ["", "a".repeat(101), "Address\nNewline"]) await expect(searchAddress(input)).rejects.toThrow("U.S. addresses");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns no invented match and filters malformed coordinates", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ result: { addressMatches: [{ ...match, coordinates: { x: 300, y: 0 } }] } })));
    const { searchAddress } = await import("../lib/server/address-search");
    expect(await searchAddress(address)).toEqual([]);
  });
  it.each([new Response("private upstream detail", { status: 500 }), new Response("bad JSON"), new Response("{}"), new Response("x".repeat(100_001))])("fails friendly without caching bad responses", async (response) => {
    vi.mocked(fetch).mockResolvedValueOnce(response).mockRejectedValueOnce(new Error("secret internal URL"));
    const { searchAddress } = await import("../lib/server/address-search");
    await expect(searchAddress(address)).rejects.toThrow("taking a break");
    await expect(searchAddress(address)).rejects.toThrow("taking a break");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("respects provider rate limits without repeating requests during cooldown", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 429 }));
    const { searchAddress } = await import("../lib/server/address-search");
    await expect(searchAddress(address)).rejects.toThrow("taking a break");
    await expect(searchAddress("Another address")).rejects.toThrow("taking a break");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("throttles uncached searches per warm instance", async () => {
    vi.mocked(fetch).mockImplementation(async () => response());
    const { searchAddress } = await import("../lib/server/address-search");
    for (let i = 0; i < 30; i++) await searchAddress("Public test address " + i);
    await expect(searchAddress("One more address")).rejects.toThrow("try again in a minute");
    expect(fetch).toHaveBeenCalledTimes(30);
  });
});
