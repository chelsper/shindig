import "server-only";
import { localDate, localHour, type EventForecast, type WeatherHour, type WeatherLocation } from "../../weather";
import { WeatherUnavailable, type HistoricalDay, type WeatherProvider } from "./provider";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (value: unknown, min = -Infinity, max = Infinity): number | null => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const temperature = (value: unknown) => number(value, -150, 160);
const timestamp = (value: unknown) => { const seconds = number(value, 0, 9e9); return seconds === null ? null : seconds * 1000; };

export function weatherCondition(value: unknown): string | null {
  const code = number(value);
  if (code === 0) return "Clear skies";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if ([51, 53, 55].includes(code ?? -1)) return "Drizzle";
  if ([56, 57, 66, 67].includes(code ?? -1)) return "Freezing rain";
  if ([61, 63, 65].includes(code ?? -1)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return "Snow";
  if ([80, 81, 82].includes(code ?? -1)) return "Rain showers";
  if ([95, 96, 99].includes(code ?? -1)) return "Thunderstorms";
  return null;
}

function assertUnits(body: ObjectValue, group: string, units: Record<string, string>) {
  const actual = object(body[`${group}_units`]);
  if (Object.entries(units).some(([key, value]) => actual[key] !== value)) throw new WeatherUnavailable();
}

// Open-Meteo daily labels use its returned fixed offset (which can differ from
// the event's DST offset). Hourly/current epoch instants instead use IANA time.
function dailyDate(value: unknown, offset: unknown): string | null {
  const at = timestamp(value);
  const seconds = number(offset, -50400, 50400);
  return at !== null && seconds !== null ? new Date(at + seconds * 1000).toISOString().slice(0, 10) : null;
}

function eventForecast(body: ObjectValue, event: WeatherLocation): EventForecast | null {
  const daily = object(body.daily);
  const date = localDate(event.startsAtUtc, event.timeZone);
  const index = array(daily.time).findIndex((at) => dailyDate(at, body.utc_offset_seconds) === date);
  if (index < 0) return null;
  assertUnits(body, "daily", { time: "unixtime", temperature_2m_max: "°F", temperature_2m_min: "°F", precipitation_probability_max: "%", wind_speed_10m_max: "mp/h", wind_gusts_10m_max: "mp/h" });
  const high = temperature(array(daily.temperature_2m_max)[index]);
  const low = temperature(array(daily.temperature_2m_min)[index]);
  const condition = weatherCondition(array(daily.weather_code)[index]);
  if (high === null || low === null || high < low || !condition) return null;
  assertUnits(body, "hourly", { time: "unixtime", temperature_2m: "°F", precipitation_probability: "%" });
  const hourly = object(body.hourly);
  const start = Date.parse(event.startsAtUtc);
  const hours = array(hourly.time).flatMap((value, i): WeatherHour[] => {
    const at = timestamp(value);
    const temp = temperature(array(hourly.temperature_2m)[i]);
    const condition = weatherCondition(array(hourly.weather_code)[i]);
    if (at === null || at < start - 2 * 3600000 || at > start + 4 * 3600000 || temp === null || !condition) return [];
    return [{ at, temperature: temp, condition, precipitationProbability: number(array(hourly.precipitation_probability)[i], 0, 100) }];
  });
  return {
    date, high, low, condition, hours,
    eventTemperature: hours.find((hour) => Math.abs(hour.at - start) < 30 * 60000)?.temperature ?? null,
    precipitationProbability: number(array(daily.precipitation_probability_max)[index], 0, 100),
    windSpeed: number(array(daily.wind_speed_10m_max)[index], 0, 300),
    windGusts: number(array(daily.wind_gusts_10m_max)[index], 0, 300),
  };
}

export function createOpenMeteoProvider(fetcher: typeof fetch = fetch, now = Date.now): WeatherProvider {
  const blockedUntil = new Map<string, number>();
  async function request(kind: "live" | "history", event: WeatherLocation, params: Record<string, string>): Promise<ObjectValue> {
    if ((blockedUntil.get(kind) ?? 0) > now()) throw new WeatherUnavailable();
    const key = process.env.OPEN_METEO_API_KEY?.trim();
    const host = kind === "history" ? "archive-api" : "api";
    const url = new URL(`https://${key ? "customer-" : ""}${host}.open-meteo.com/v1/${kind === "history" ? "archive" : "forecast"}`);
    url.search = new URLSearchParams({ latitude: String(event.coordinates.latitude), longitude: String(event.coordinates.longitude), timezone: event.timeZone, timeformat: "unixtime", temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "mm", ...params, ...(key ? { apikey: key } : {}) }).toString();
    try {
      const response = await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(7000) });
      if (!response.ok) {
        const header = response.headers.get("Retry-After");
        const retry = header && /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - now()) / 1000 : 60;
        const seconds = Number.isFinite(retry) ? Math.max(60, Math.min(retry, 86400)) : 60;
        blockedUntil.set(kind, now() + seconds * 1000);
        throw new WeatherUnavailable(seconds);
      }
      const body = object(await response.json());
      if (body.error || body.timezone !== event.timeZone) throw new WeatherUnavailable();
      return body;
    } catch {
      // Never log/return a provider URL, key, response body, or raw exception.
      blockedUntil.set(kind, Math.max(blockedUntil.get(kind) ?? 0, now() + 60_000));
      throw new WeatherUnavailable();
    }
  }

  return {
    id: "open-meteo-era5-v1",
    forecastDays: 16,
    async live(event, includeForecast) {
      const body = await request("live", event, {
        current: "temperature_2m,weather_code", forecast_days: includeForecast ? "16" : "1",
        ...(includeForecast ? { daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max", hourly: "temperature_2m,weather_code,precipitation_probability" } : {}),
      });
      let current = null;
      try {
        assertUnits(body, "current", { time: "unixtime", temperature_2m: "°F" });
        const raw = object(body.current);
        const at = timestamp(raw.time), temp = temperature(raw.temperature_2m), condition = weatherCondition(raw.weather_code);
        if (at !== null && temp !== null && condition) current = { at, temperature: temp, condition };
      } catch { /* A missing current value must not discard a valid forecast. */ }
      let forecast = null;
      try { forecast = includeForecast ? eventForecast(body, event) : null; } catch { /* A malformed forecast is unavailable, never guessed. */ }
      return { current, forecast };
    },
    async history(event, window) {
      const body = await request("history", event, { start_date: window.start, end_date: window.end, models: "era5", daily: "temperature_2m_max,temperature_2m_min,precipitation_sum", hourly: "temperature_2m" });
      assertUnits(body, "daily", { time: "unixtime", temperature_2m_max: "°F", temperature_2m_min: "°F", precipitation_sum: "mm" });
      const daily = object(body.daily), hourly = object(body.hourly);
      const hourlyUnits = object(body.hourly_units);
      const eventHour = localHour(event.startsAtUtc, event.timeZone);
      const eventTemps = new Map<string, number>();
      if (hourlyUnits.time === "unixtime" && hourlyUnits.temperature_2m === "°F") {
        array(hourly.time).forEach((value, i) => {
          const at = timestamp(value), temp = temperature(array(hourly.temperature_2m)[i]);
          if (at !== null && temp !== null && localHour(at, event.timeZone) === eventHour) eventTemps.set(localDate(at, event.timeZone), temp);
        });
      }
      return array(daily.time).flatMap((value, i): HistoricalDay[] => {
        const date = dailyDate(value, body.utc_offset_seconds);
        const high = temperature(array(daily.temperature_2m_max)[i]), low = temperature(array(daily.temperature_2m_min)[i]);
        const precipitation = number(array(daily.precipitation_sum)[i], 0, 3000);
        if (!date || date < window.start || date > window.end || high === null || low === null || high < low || precipitation === null) return [];
        return [{ date, high, low, precipitation, eventTemperature: eventTemps.get(date) ?? null }];
      });
    },
  };
}
