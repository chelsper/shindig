import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { OYSTER_ROAST_EVENT as event } from "../lib/oyster-roast-event";
import { CLIMATE_WEATHER_TTL, DAY_MS } from "../lib/weather";
import { createWeatherCache, type WeatherCache } from "../lib/server/weather/cache";
import { createOpenMeteoProvider } from "../lib/server/weather/open-meteo";
import { createWeatherService } from "../lib/server/weather/service";
import { historyWindows } from "../lib/server/weather/climate";
import { reportWeatherFailure } from "../lib/server/weather/diagnostics";
import { WeatherUnavailable, type HistoryWindow, type WeatherProvider } from "../lib/server/weather/provider";
import { weatherNow } from "./fixtures/weather";

const daysFor = (window: HistoryWindow) => Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse(window.start) + i * DAY_MS).toISOString().slice(0, 10), high: 75, low: 55, precipitation: 0, eventTemperature: 70 }));
function archiveBody(start = "2025-11-04") {
  return {
    timezone: event.timeZone, utc_offset_seconds: -14400,
    daily_units: { time: "unixtime", temperature_2m_max: "°F", temperature_2m_min: "°F", precipitation_sum: "mm" },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => (Date.parse(`${start}T04:00:00Z`) + i * DAY_MS) / 1000),
      temperature_2m_max: Array(7).fill(75), temperature_2m_min: Array(7).fill(55), precipitation_sum: Array(7).fill(0),
    },
  };
}
beforeEach(() => { vi.stubEnv("OPEN_METEO_API_KEY", ""); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("historical provider recovery", () => {
  it("retries one transient year without suppressing the other 19 years", async () => {
    let failed = false;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const start = new URL(String(input)).searchParams.get("start_date")!;
      if (start.startsWith("2025") && !failed) { failed = true; return Response.json({}, { status: 503 }); }
      return Response.json(archiveBody(start));
    });
    const result = await createWeatherService(createOpenMeteoProvider(fetcher), createWeatherCache()).typical(event);
    expect(result?.years).toHaveLength(20); expect(result?.sampleDays).toBe(140);
    expect(fetcher).toHaveBeenCalledTimes(21);
  });
  it("an unretryable bad window still allows the other valid years to display", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const start = new URL(String(input)).searchParams.get("start_date")!;
      return start.startsWith("2025") ? Response.json({}, { status: 400 }) : Response.json(archiveBody(start));
    });
    const result = await createWeatherService(createOpenMeteoProvider(fetcher), createWeatherCache()).typical(event);
    expect(result?.years).toHaveLength(19); expect(result?.years).not.toContain(2025);
    expect(fetcher).toHaveBeenCalledTimes(20);
  });
  it.each(["TimeoutError", "TypeError"])("recovers once from %s without a provider-wide circuit breaker", async (name) => {
    const error = new Error("private URL and key"); error.name = name;
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(error).mockResolvedValue(Response.json(archiveBody()));
    const provider = createOpenMeteoProvider(fetcher);
    expect(await provider.history(event, historyWindows(event, weatherNow)[0])).toHaveLength(7);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private URL");
  });
  it.each([401, 403, 429, 503])("honors a provider-wide Retry-After for HTTP %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status, headers: { "Retry-After": "120" } }));
    const provider = createOpenMeteoProvider(fetcher, () => weatherNow);
    const window = historyWindows(event, weatherNow)[0];
    await expect(provider.history(event, window)).rejects.toMatchObject({ retryAfter: 120, status });
    await expect(provider.history(event, window)).rejects.toMatchObject({ reason: "cooldown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops before fetching when the shared history deadline has expired", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createOpenMeteoProvider(fetcher).history(event, historyWindows(event, weatherNow)[0], AbortSignal.abort())).rejects.toMatchObject({ reason: "budget" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("historical cache recovery", () => {
  it("reuses complete years on a later attempt, never persists incomplete years or null aggregates", async () => {
    let now = weatherNow, incomplete = true;
    const saved = new Map<string, unknown>();
    const persist: WeatherCache = async <T>(key: string, _ttl: number, load: () => Promise<T>) => {
      if (saved.has(key)) return saved.get(key) as T;
      const data = await load(); saved.set(key, data); return data;
    };
    const history = vi.fn(async (_event, window: HistoryWindow) => incomplete && window.year > 2019 ? [] : daysFor(window));
    const provider: WeatherProvider = { id: "fixture", forecastDays: 16, history, live: vi.fn() };
    const service = () => createWeatherService(provider, createWeatherCache(persist, () => now), () => now);
    expect(await service().typical(event)).toBeNull();
    expect(saved.size).toBe(14);
    for (const [key, value] of saved) { expect(key.startsWith("history:")).toBe(true); expect(value).toHaveLength(7); }
    incomplete = false; now += 61_000;
    expect((await service().typical(event))?.years).toHaveLength(20);
    expect(history).toHaveBeenCalledTimes(26);
  });
  it("coalesces concurrent full-history requests", async () => {
    const history = vi.fn(async (_event, window: HistoryWindow) => daysFor(window));
    const provider: WeatherProvider = { id: "fixture", forecastDays: 16, history, live: vi.fn() };
    const service = createWeatherService(provider, createWeatherCache());
    const results = await Promise.all([service.typical(event), service.typical(event)]);
    expect(results[0]).toEqual(results[1]); expect(history).toHaveBeenCalledTimes(20);
  });
  it("loads directly when the persistent cache cannot be read", async () => {
    const persist: WeatherCache = async () => { throw new Error("private cache details"); };
    const loader = vi.fn().mockResolvedValue("valid history");
    const cache = createWeatherCache(persist);
    expect(await cache("history", CLIMATE_WEATHER_TTL, loader)).toBe("valid history");
    expect(await cache("history", CLIMATE_WEATHER_TTL, loader)).toBe("valid history");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private cache details");
  });
  it("keeps a loaded result if a cache write fails, without fetching twice", async () => {
    const persist: WeatherCache = async (_key, _ttl, load) => { await load(); throw new Error("cache offline"); };
    const loader = vi.fn().mockResolvedValue("valid history");
    expect(await createWeatherCache(persist)("history", CLIMATE_WEATHER_TTL, loader)).toBe("valid history");
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it("does not retry provider failures through the cache fallback or bypass Retry-After", async () => {
    let now = weatherNow;
    const loader = vi.fn().mockRejectedValue(new WeatherUnavailable(120, "rate-limit", 429));
    const cache = createWeatherCache(undefined, () => now);
    await expect(cache("history", CLIMATE_WEATHER_TTL, loader)).rejects.toMatchObject({ status: 429 });
    now += 61_000;
    await expect(cache("history", CLIMATE_WEATHER_TTL, loader)).rejects.toMatchObject({ status: 429 });
    expect(loader).toHaveBeenCalledTimes(1);
    now += 60_000; loader.mockResolvedValue("recovered");
    expect(await cache("history", CLIMATE_WEATHER_TTL, loader)).toBe("recovered");
  });
  it("logs only allowlisted error categories and numeric context", () => {
    reportWeatherFailure("history", new Error("postgresql://secret@private/db?apikey=secret"), { year: 2025 });
    reportWeatherFailure("history", new WeatherUnavailable(120, "rate-limit", 429), { year: 2024 });
    expect(vi.mocked(console.warn).mock.calls).toEqual([
      ["Shindig weather unavailable", { scope: "history", reason: "internal", year: 2025 }],
      ["Shindig weather unavailable", { scope: "history", reason: "rate-limit", status: 429, year: 2024 }],
    ]);
  });
});
