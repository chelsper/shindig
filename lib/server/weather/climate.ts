import "server-only";
import { DAY_MS, localDate, type TypicalWeather, type WeatherLocation } from "../../weather";
import type { HistoricalDay, HistoryWindow } from "./provider";

export function historyWindows(event: WeatherLocation, now: number): HistoryWindow[] {
  const date = localDate(event.startsAtUtc, event.timeZone);
  const [eventYear, month, day] = date.split("-").map(Number);
  const lastYear = Math.min(eventYear, Number(localDate(now, event.timeZone).slice(0, 4))) - 1;
  return Array.from({ length: 20 }, (_, index) => {
    const year = lastYear - index;
    // February 29 uses February 28 in non-leap historical years.
    const center = Date.UTC(year, month - 1, Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate()));
    return { year, start: new Date(center - 3 * DAY_MS).toISOString().slice(0, 10), end: new Date(center + 3 * DAY_MS).toISOString().slice(0, 10) };
  }).filter((window) => Date.parse(window.end) < now - 7 * DAY_MS);
}

export function calculateTypical(samples: { window: HistoryWindow; days: HistoricalDay[] }[]): TypicalWeather | null {
  const complete = samples.filter(({ window, days }) => {
    const expected = Array.from({ length: 7 }, (_, index) => new Date(Date.parse(window.start) + index * DAY_MS).toISOString().slice(0, 10));
    return days.length === 7 && expected.every((date) => days.filter((day) => day.date === date).length === 1)
      && days.every((day) => Number.isFinite(day.high) && Number.isFinite(day.low) && Number.isFinite(day.precipitation) && day.precipitation >= 0);
  });
  if (complete.length < 15) return null;
  const days = complete.flatMap((sample) => sample.days);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const eventTemperatures = complete.filter(({ days }) => days.every((day) => day.eventTemperature !== null && Number.isFinite(day.eventTemperature)))
    .flatMap(({ days }) => days.map((day) => day.eventTemperature!));
  return {
    high: average(days.map((day) => day.high)), low: average(days.map((day) => day.low)),
    eventTemperature: eventTemperatures.length >= 15 * 7 ? average(eventTemperatures) : null,
    wetDayPercent: 100 * days.filter((day) => day.precipitation >= 1).length / days.length,
    sampleDays: days.length, years: complete.map(({ window }) => window.year).sort((a, b) => a - b),
    windowStart: complete[0].window.start, windowEnd: complete[0].window.end,
  };
}
