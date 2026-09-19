import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { OYSTER_ROAST_EVENT as event } from "../lib/oyster-roast-event";
import { CLIMATE_WEATHER_TTL, DAY_MS, LIVE_WEATHER_TTL, eventDaysAway, freshWeather, localDate, localHour, weatherTime } from "../lib/weather";
import { createWeatherCache, type WeatherCache } from "../lib/server/weather/cache";
import { calculateTypical, historyWindows } from "../lib/server/weather/climate";
import { createOpenMeteoProvider, weatherCondition } from "../lib/server/weather/open-meteo";
import { WeatherUnavailable, type HistoryWindow, type WeatherProvider } from "../lib/server/weather/provider";
import { createWeatherService } from "../lib/server/weather/service";
import { eventSun } from "../lib/server/weather/sun";
import { forecast, liveResponse, weather, weatherNow } from "./fixtures/weather";

afterEach(() => vi.unstubAllEnvs());
const daysFor = (window: HistoryWindow) => Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse(window.start) + i * DAY_MS).toISOString().slice(0, 10), high: 70 + i, low: 50 + i, precipitation: i % 2 ? 1 : 0, eventTemperature: 65 + i }));
function setup(now = weatherNow) {
  const provider: WeatherProvider = { id: "fixture", forecastDays: 16, live: vi.fn().mockResolvedValue({ current: weather.current, forecast }), history: vi.fn(async (_event, window) => daysFor(window)) };
  const clock = () => now;
  const service = createWeatherService(provider, createWeatherCache(undefined, clock), clock);
  return { provider, service };
}

describe("event-local dates and sun", () => {
  it("keeps event time local regardless of the server timezone", () => {
    expect(localDate(event.startsAtUtc, event.timeZone)).toBe("2026-11-07");
    expect(localHour(event.startsAtUtc, event.timeZone)).toBe(17);
    expect(weatherTime(Date.parse(event.startsAtUtc), event.timeZone, true)).toBe("5:00 PM");
    expect(eventDaysAway(event, Date.parse("2026-11-08T02:00:00Z"))).toBe(0);
    expect(eventDaysAway(event, Date.parse("2026-11-08T05:00:00Z"))).toBe(-1);
    expect(eventDaysAway(event, Date.parse("2026-10-23T12:00:00Z"))).toBe(15);
  });
  it("calculates event-day sunrise and sunset without a provider, in EST", () => {
    const sun = eventSun(event);
    expect(sun.sunset).not.toBeNull();
    expect(localHour(sun.sunset!, event.timeZone)).toBe(17);
    expect(localHour(sun.sunrise!, event.timeZone)).toBe(6);
    expect(localDate(sun.sunset!, event.timeZone)).toBe("2026-11-07");
    expect(Math.abs(sun.sunset! - Date.parse("2026-11-07T22:35:00Z"))).toBeLessThan(10 * 60000);
    expect(weatherTime(sun.sunset!, event.timeZone, true)).not.toContain("10:");
  });
  it("supports summer daylight saving and polar days without invented sun times", () => {
    const summer = { ...event, startsAtUtc: "2026-06-21T21:00:00Z" };
    expect(localHour(eventSun(summer).sunset!, event.timeZone)).toBe(20);
    expect(eventSun({ ...summer, coordinates: { latitude: 89, longitude: 0 } }).sunset).toBeNull();
  });
});

describe("historical calculation", () => {
  it("uses 20 prior completed years and only November 4–10", () => {
    const windows = historyWindows(event, weatherNow);
    expect(windows).toHaveLength(20);
    expect(windows[0]).toEqual({ year: 2025, start: "2025-11-04", end: "2025-11-10" });
    expect(windows[19].year).toBe(2006);
    const samples = windows.map((window) => ({ window, days: daysFor(window) }));
    const result = calculateTypical(samples)!;
    expect(result.high).toBe(73);
    expect(result.low).toBe(53);
    expect(result.eventTemperature).toBe(68);
    expect(result.wetDayPercent).toBeCloseTo(3 / 7 * 100);
    expect(result.sampleDays).toBe(140);
  });
  it("requires 15 complete years; missing days and null precipitation are not dry days", () => {
    const samples = historyWindows(event, weatherNow).map((window) => ({ window, days: daysFor(window) }));
    expect(calculateTypical(samples.slice(0, 14))).toBeNull();
    expect(calculateTypical(samples.slice(0, 15))?.sampleDays).toBe(105);
    for (let i = 0; i < 6; i++) samples[i].days.pop();
    expect(calculateTypical(samples)).toBeNull();
  });
  it("omits an evening temperature without enough hourly coverage", () => {
    const samples = historyWindows(event, weatherNow).map((window) => ({ window, days: daysFor(window).map((day) => ({ ...day, eventTemperature: null })) }));
    expect(calculateTypical(samples)?.eventTemperature).toBeNull();
  });
  it("handles year boundaries and February 29 without future archive requests", () => {
    const january = historyWindows({ ...event, startsAtUtc: "2027-01-01T22:00:00Z" }, weatherNow);
    expect(january[0]).toEqual({ year: 2025, start: "2024-12-29", end: "2025-01-04" });
    const leap = historyWindows({ ...event, startsAtUtc: "2028-02-29T22:00:00Z" }, weatherNow);
    expect(leap[0]).toEqual({ year: 2025, start: "2025-02-25", end: "2025-03-03" });
  });
});

describe("weather state transitions", () => {
  it("never requests or accepts an event forecast outside the provider range", async () => {
    const { service, provider } = setup();
    const result = await service.live(event);
    expect(provider.live).toHaveBeenCalledWith(event, false);
    expect(result.mode).toBe("typical");
    expect(result.forecast).toBeNull();
    expect(result.current?.temperature).toBe(82);
    expect((await service.typical(event))?.years).toHaveLength(20);
  });
  it.each([["2026-10-22T12:00:00Z", false], ["2026-10-23T12:00:00Z", true]])("respects the 16-day inclusive-today boundary at %s", async (at, inRange) => {
    const { service, provider } = setup(Date.parse(at));
    const result = await service.live(event);
    expect(provider.live).toHaveBeenCalledWith(event, inRange);
    expect(result.mode).toBe(inRange ? "forecast" : "typical");
  });
  it("prioritizes actual forecast and then event-day hourly data", async () => {
    const { service } = setup(Date.parse("2026-11-07T16:00:00Z"));
    const result = await service.live(event);
    expect(result.mode).toBe("event-day");
    expect(result.forecast?.hours).toHaveLength(7);
    expect(result.forecast?.eventTemperature).toBe(74);
  });
  it("requires actual target-day data, not just a date inside a theoretical range", async () => {
    const { service, provider } = setup(Date.parse("2026-11-01T12:00:00Z"));
    vi.mocked(provider.live).mockResolvedValue({ current: null, forecast: null });
    expect((await service.live(event)).mode).toBe("typical");
    vi.mocked(provider.live).mockResolvedValue({ current: null, forecast: { ...forecast, date: "2026-11-06" } });
    const uncached = createWeatherService(provider, (_key, _ttl, load) => load(), () => Date.parse("2026-11-01T12:00:00Z"));
    expect((await uncached.live(event)).forecast).toBeNull();
  });
  it("isolates provider failures and retains calculated sunset", async () => {
    const { service, provider } = setup();
    vi.mocked(provider.live).mockRejectedValue(new Error("private provider failure"));
    vi.mocked(provider.history).mockRejectedValue(new Error("private provider failure"));
    const result = await service.live(event);
    expect(result.current).toBeNull();
    expect(result.forecast).toBeNull();
    expect(result.sun.sunset).toBeTypeOf("number");
    expect(await service.typical(event)).toBeNull();
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("does not present stale or future-dated conditions as current", async () => {
    const { service, provider } = setup();
    vi.mocked(provider.live).mockResolvedValue({ current: { ...weather.current!, at: weatherNow - 46 * 60000 }, forecast: null });
    expect((await service.live(event)).current).toBeNull();
    expect(freshWeather(weather, weather.expiresAt).current).toBeNull();
    expect(freshWeather({ ...weather, forecast }, weather.expiresAt).forecast).toBeNull();
    expect(freshWeather({ ...weather, forecast }, Date.parse("2026-11-08T05:00:00Z")).mode).toBe("past");
  });
  it("bounds archive concurrency and accepts 15 complete years when some calls fail", async () => {
    const { service, provider } = setup();
    let pending = 0, max = 0;
    vi.mocked(provider.history).mockImplementation(async (_event, window) => {
      pending++; max = Math.max(max, pending);
      await Promise.resolve();
      pending--;
      if (window.year < 2011) throw new WeatherUnavailable();
      return daysFor(window);
    });
    expect((await service.typical(event))?.years).toHaveLength(15);
    expect(max).toBeLessThanOrEqual(3);
  });
  it("does not relabel a stale cached response as newly fetched", async () => {
    const { provider } = setup();
    const staleCache: WeatherCache = async <T>() => ({ current: weather.current, forecast, fetchedAt: weatherNow - LIVE_WEATHER_TTL - 1 }) as T;
    const service = createWeatherService(provider, staleCache, () => weatherNow);
    const result = await service.live(event);
    expect(result.current).toBeNull();
    expect(result.forecast).toBeNull();
  });
  it("rejects implausibly future-dated current conditions", async () => {
    const { provider, service } = setup();
    vi.mocked(provider.live).mockResolvedValue({ current: { ...weather.current!, at: weatherNow + 30 * 60000 }, forecast: null });
    expect((await service.live(event)).current).toBeNull();
  });
});

describe("weather caching", () => {
  it("coalesces requests, reuses results, and uses new keys at expiry", async () => {
    let now = weatherNow;
    const persistedKeys: string[] = [];
    const persist: WeatherCache = (key, _ttl, load) => { persistedKeys.push(key); return load(); };
    const cache = createWeatherCache(persist, () => now);
    const loader = vi.fn().mockResolvedValue("fresh");
    expect(await Promise.all([cache("live", LIVE_WEATHER_TTL, loader), cache("live", LIVE_WEATHER_TTL, loader)])).toEqual(["fresh", "fresh"]);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache("live", LIVE_WEATHER_TTL, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    now += LIVE_WEATHER_TTL;
    await cache("live", LIVE_WEATHER_TTL, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(persistedKeys[0]).not.toBe(persistedKeys[1]);
  });
  it("does not reuse old successful data after refresh failure and cools down errors", async () => {
    let now = weatherNow;
    const cache = createWeatherCache(undefined, () => now);
    const loader = vi.fn().mockResolvedValueOnce("fresh").mockRejectedValue(new Error("outage"));
    await cache("live", LIVE_WEATHER_TTL, loader);
    now += LIVE_WEATHER_TTL;
    await expect(cache("live", LIVE_WEATHER_TTL, loader)).rejects.toThrow("Weather unavailable");
    await expect(cache("live", LIVE_WEATHER_TTL, loader)).rejects.toThrow("Weather unavailable");
    expect(loader).toHaveBeenCalledTimes(2);
    now += 61_000;
    loader.mockResolvedValue("recovered");
    expect(await cache("live", LIVE_WEATHER_TTL, loader)).toBe("recovered");
  });
  it("caches historical aggregates independently for 30 days", async () => {
    let now = weatherNow;
    const cache = createWeatherCache(undefined, () => now);
    const history = vi.fn().mockResolvedValue("typical");
    await cache("climate", CLIMATE_WEATHER_TTL, history);
    now += LIVE_WEATHER_TTL;
    await cache("climate", CLIMATE_WEATHER_TTL, history);
    expect(history).toHaveBeenCalledTimes(1);
    now += CLIMATE_WEATHER_TTL;
    await cache("climate", CLIMATE_WEATHER_TTL, history);
    expect(history).toHaveBeenCalledTimes(2);
  });
});

describe("Open-Meteo adapter", () => {
  it("calls only the canonical location and only requests current data when far away", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(liveResponse()));
    const result = await createOpenMeteoProvider(fetcher).live(event, false);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.hostname).toBe("api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe(String(event.coordinates.latitude));
    expect(url.searchParams.get("timezone")).toBe(event.timeZone);
    expect(url.searchParams.get("forecast_days")).toBe("1");
    expect(url.searchParams.has("hourly")).toBe(false);
    expect(result.forecast).toBeNull();
    expect(result.current?.condition).toBe("Clear skies");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });
  it("normalizes daily labels and event-time hours correctly across DST", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(liveResponse()));
    const result = await createOpenMeteoProvider(fetcher).live(event, true);
    expect(result.forecast).toEqual(forecast);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("forecast_days")).toBe("16");
    expect(weatherTime(result.forecast!.hours[2].at, event.timeZone)).toBe("5 PM");
  });
  it("keeps missing precipitation and temperature null, never zero or invented", async () => {
    const response = liveResponse();
    response.daily.precipitation_probability_max = [null as unknown as number];
    response.hourly.temperature_2m[2] = null as unknown as number;
    const result = await createOpenMeteoProvider(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).live(event, true);
    expect(result.forecast?.precipitationProbability).toBeNull();
    expect(result.forecast?.eventTemperature).toBeNull();
    expect(result.forecast?.hours).toHaveLength(6);
  });
  it("rejects malformed units and missing target-day values without inventing weather", async () => {
    const response = liveResponse();
    response.current_units.temperature_2m = "°C";
    response.daily.temperature_2m_max = [null as unknown as number];
    const result = await createOpenMeteoProvider(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).live(event, true);
    expect(result).toEqual({ current: null, forecast: null });
    expect(weatherCondition(999)).toBeNull();
  });
  it("uses server-only keyed hosts when commercial access is configured", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "secret-test-key");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(liveResponse()));
    const data = await createOpenMeteoProvider(fetcher).live(event, false);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.hostname).toBe("customer-api.open-meteo.com");
    expect(url.searchParams.get("apikey")).toBe("secret-test-key");
    expect(JSON.stringify(data)).not.toContain("secret-test-key");
  });
  it("honors provider 429 cooldown without immediate retries", async () => {
    let now = weatherNow;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "120" } }));
    const provider = createOpenMeteoProvider(fetcher, () => now);
    await expect(provider.live(event, false)).rejects.toThrow("Weather unavailable");
    await expect(provider.live(event, false)).rejects.toThrow("Weather unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 121_000;
    fetcher.mockResolvedValue(Response.json(liveResponse()));
    await provider.live(event, false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([403, 500, 503])("returns safe failures for HTTP %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "secret provider detail" }, { status }));
    await expect(createOpenMeteoProvider(fetcher).live(event, false)).rejects.toThrow("Weather unavailable");
  });
  it("calculates local event-hour temperatures from ERA5 epochs, not the daily offset", async () => {
    const start = Date.parse("2025-11-04T04:00:00Z") / 1000;
    const body = {
      timezone: event.timeZone, utc_offset_seconds: -14400,
      daily_units: { time: "unixtime", temperature_2m_max: "°F", temperature_2m_min: "°F", precipitation_sum: "mm" },
      daily: { time: [start], temperature_2m_max: [75], temperature_2m_min: [55], precipitation_sum: [1] },
      hourly_units: { time: "unixtime", temperature_2m: "°F" },
      hourly: { time: [Date.parse("2025-11-04T21:00:00Z") / 1000, Date.parse("2025-11-04T22:00:00Z") / 1000], temperature_2m: [72, 70] },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const result = await createOpenMeteoProvider(fetcher).history(event, { year: 2025, start: "2025-11-04", end: "2025-11-10" });
    expect(result).toEqual([{ date: "2025-11-04", high: 75, low: 55, precipitation: 1, eventTemperature: 70 }]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("models")).toBe("era5");
    expect(url.searchParams.get("start_date")).toBe("2025-11-04");
  });
});
