import "server-only";
import { CLIMATE_WEATHER_TTL, LIVE_WEATHER_TTL, eventDaysAway, localDate, type EventWeather, type WeatherLocation } from "../../weather";
import { type WeatherCache } from "./cache";
import { calculateTypical, historyWindows } from "./climate";
import { WeatherUnavailable, type HistoricalDay, type WeatherProvider } from "./provider";
import { eventSun } from "./sun";

export function createWeatherService(provider: WeatherProvider, cache: WeatherCache, now = Date.now) {
  const eventKey = (event: WeatherLocation) => JSON.stringify([provider.id, event.coordinates, event.timeZone, event.startsAtUtc]);
  return {
    async live(event: WeatherLocation): Promise<EventWeather> {
      const time = now();
      const daysAway = eventDaysAway(event, time);
      const forecastInRange = daysAway >= 0 && daysAway < provider.forecastDays;
      const eventDate = localDate(event.startsAtUtc, event.timeZone);
      let current: EventWeather["current"] = null, forecast: EventWeather["forecast"] = null;
      let fetchedAt = time;
      let expiresAt = time;
      try {
        const result = await cache(`live:${eventKey(event)}:${localDate(time, event.timeZone)}:${forecastInRange}`, LIVE_WEATHER_TTL, async () => ({ ...await provider.live(event, forecastInRange), fetchedAt: now() }));
        fetchedAt = result.fetchedAt;
        expiresAt = fetchedAt + LIVE_WEATHER_TTL;
        const fresh = fetchedAt <= now() + 5000 && expiresAt > now();
        if (fresh && result.current && result.current.at <= now() + 5 * 60000 && result.current.at > now() - 45 * 60000) {
          current = { ...result.current, expiresAt: Math.min(expiresAt, result.current.at + 45 * 60000) };
        }
        if (fresh && forecastInRange && result.forecast?.date === eventDate) forecast = result.forecast;
      } catch { /* Live failure doesn't remove climate or the calculated sun. */ }
      return { mode: forecast ? (daysAway === 0 ? "event-day" : "forecast") : (daysAway < 0 ? "past" : "typical"), eventDate, timeZone: event.timeZone, forecastInRange, current, forecast, fetchedAt, expiresAt, sun: eventSun(event) };
    },
    async typical(event: WeatherLocation) {
      const windows = historyWindows(event, now());
      try {
        return await cache(`climate:${eventKey(event)}:${windows.map((w) => w.year).join(",")}`, CLIMATE_WEATHER_TTL, async () => {
          const samples: { window: typeof windows[number]; days: HistoricalDay[] }[] = [];
          let next = 0;
          // At most three concurrent requests; at most 20 seven-day windows.
          await Promise.all(Array.from({ length: 3 }, async () => {
            while (next < windows.length) {
              const window = windows[next++];
              try {
                const days = await cache(`history:${eventKey(event)}:${window.start}:${window.end}`, CLIMATE_WEATHER_TTL, () => provider.history(event, window));
                samples.push({ window, days });
              } catch { /* Only complete years enter the calculation. */ }
            }
          }));
          const result = calculateTypical(samples);
          if (!result) throw new WeatherUnavailable();
          return result;
        });
      } catch { return null; }
    },
  };
}
