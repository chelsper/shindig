import "server-only";
import type { EventForecast, WeatherLocation } from "../../weather";

export type LiveWeather = {
  current: { at: number; temperature: number; condition: string } | null;
  forecast: EventForecast | null;
};

export type HistoryWindow = { year: number; start: string; end: string };
export type HistoricalDay = { date: string; high: number; low: number; precipitation: number; eventTemperature: number | null };

export interface WeatherProvider {
  id: string;
  forecastDays: number;
  live(event: WeatherLocation, includeForecast: boolean): Promise<LiveWeather>;
  history(event: WeatherLocation, window: HistoryWindow, signal?: AbortSignal): Promise<HistoricalDay[]>;
}

export type WeatherFailureReason = "unavailable" | "http" | "rate-limit" | "cooldown" | "timeout" | "network" | "invalid-response" | "incomplete-history" | "budget";

export class WeatherUnavailable extends Error {
  constructor(public retryAfter = 60, public reason: WeatherFailureReason = "unavailable", public status?: number) { super("Weather unavailable"); }
}
