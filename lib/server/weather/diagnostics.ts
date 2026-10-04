import "server-only";
import { WeatherUnavailable } from "./provider";

// Explicit allowlist only. Never log URLs, API keys, coordinates, provider
// response bodies, user input, exception messages or stack traces.
export function reportWeatherFailure(scope: "live" | "history" | "history-summary" | "cache" | "configuration", error: unknown, counts: { year?: number; completeYears?: number; requestedYears?: number } = {}) {
  console.warn("Shindig weather unavailable", {
    scope,
    reason: error instanceof WeatherUnavailable ? error.reason : "internal",
    ...(error instanceof WeatherUnavailable && error.status ? { status: error.status } : {}),
    ...counts,
  });
}
