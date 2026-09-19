import type { EventForecast, EventWeather, TypicalWeather } from "../../lib/weather";

// Synthetic fixtures only, never shipped as fallback weather.
export const weatherNow = Date.parse("2026-09-19T18:00:00Z");
export const forecast: EventForecast = {
  date: "2026-11-07", high: 77, low: 59, eventTemperature: 74, condition: "Partly cloudy",
  precipitationProbability: 30, windSpeed: 16, windGusts: 27,
  hours: Array.from({ length: 7 }, (_, i) => ({ at: Date.parse("2026-11-07T20:00:00Z") + i * 3600000, temperature: 76 - i, condition: "Partly cloudy", precipitationProbability: 20 })),
};
export const typical: TypicalWeather = {
  high: 75, low: 56, eventTemperature: 70, wetDayPercent: 20, sampleDays: 140,
  years: Array.from({ length: 20 }, (_, i) => 2006 + i), windowStart: "2025-11-04", windowEnd: "2025-11-10",
};
export const weather: EventWeather = {
  mode: "typical", eventDate: "2026-11-07", timeZone: "America/New_York", forecastInRange: false,
  sun: { sunrise: Date.parse("2026-11-07T11:47:00Z"), sunset: Date.parse("2026-11-07T22:35:00Z") },
  current: { at: weatherNow, temperature: 82, condition: "Clear skies", expiresAt: weatherNow + 600000 },
  forecast: null, fetchedAt: weatherNow, expiresAt: weatherNow + 600000,
};

export function liveResponse() {
  return {
    timezone: "America/New_York", utc_offset_seconds: -14400,
    current_units: { time: "unixtime", temperature_2m: "°F" },
    current: { time: weatherNow / 1000, temperature_2m: 82, weather_code: 0 },
    // Daily fixed offset is EDT, but Nov 7's actual local zone is EST.
    daily_units: { time: "unixtime", temperature_2m_max: "°F", temperature_2m_min: "°F", precipitation_probability_max: "%", wind_speed_10m_max: "mp/h", wind_gusts_10m_max: "mp/h" },
    daily: { time: [Date.parse("2026-11-07T04:00:00Z") / 1000], temperature_2m_max: [77], temperature_2m_min: [59], weather_code: [2], precipitation_probability_max: [30], wind_speed_10m_max: [16], wind_gusts_10m_max: [27] },
    hourly_units: { time: "unixtime", temperature_2m: "°F", precipitation_probability: "%" },
    hourly: { time: forecast.hours.map((h) => h.at / 1000), temperature_2m: forecast.hours.map((h) => h.temperature), weather_code: forecast.hours.map(() => 2), precipitation_probability: forecast.hours.map((h) => h.precipitationProbability) },
  };
}
