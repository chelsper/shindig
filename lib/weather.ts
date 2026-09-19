// Provider-neutral contract shared with the Event Hub. No credentials or raw
// provider responses belong here.
export type WeatherLocation = {
  coordinates: { latitude: number; longitude: number };
  timeZone: string;
  startsAtUtc: string;
};

export type WeatherHour = {
  at: number;
  temperature: number;
  condition: string;
  precipitationProbability: number | null;
};

export type EventForecast = {
  date: string;
  high: number;
  low: number;
  condition: string;
  precipitationProbability: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  eventTemperature: number | null;
  hours: WeatherHour[];
};

export type TypicalWeather = {
  high: number;
  low: number;
  eventTemperature: number | null;
  wetDayPercent: number;
  sampleDays: number;
  years: number[];
  windowStart: string;
  windowEnd: string;
};

export type EventWeather = {
  mode: "typical" | "forecast" | "event-day" | "past";
  eventDate: string;
  timeZone: string;
  forecastInRange: boolean;
  sun: { sunrise: number | null; sunset: number | null };
  current: { at: number; temperature: number; condition: string; expiresAt: number } | null;
  forecast: EventForecast | null;
  fetchedAt: number;
  expiresAt: number;
};

export const LIVE_WEATHER_TTL = 10 * 60 * 1000;
export const CLIMATE_WEATHER_TTL = 30 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// Always use the event's IANA zone, including across DST and UTC midnight.
export function localDate(at: number | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function localHour(at: number | string, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(at)));
}

export function weatherTime(at: number, timeZone: string, minutes = false): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", ...(minutes ? { minute: "2-digit" } : {}) }).format(at);
}

export function eventDaysAway(event: WeatherLocation, now: number): number {
  return Math.round((Date.parse(localDate(event.startsAtUtc, event.timeZone)) - Date.parse(localDate(now, event.timeZone))) / DAY_MS);
}

export function freshWeather(weather: EventWeather, now: number): EventWeather {
  const current = weather.current && now < weather.current.expiresAt ? weather.current : null;
  const dateMatches = localDate(now, weather.timeZone) <= weather.eventDate;
  const forecast = now < weather.expiresAt && dateMatches ? weather.forecast : null;
  return { ...weather, current, forecast, mode: forecast ? (localDate(now, weather.timeZone) === weather.eventDate ? "event-day" : "forecast") : (dateMatches ? "typical" : "past") };
}
