import "server-only";
import { unstable_cache } from "next/cache";
import { createWeatherCache } from "./cache";
import { createOpenMeteoProvider } from "./open-meteo";
import { createWeatherService } from "./service";

// Next's Data Cache survives serverless invocations; the outer cache coalesces
// requests per warm instance. Versioned time-bucket keys prohibit stale live data.
const cache = createWeatherCache((key, ttl, load) => unstable_cache(load, ["shindig-weather-v1", key], { revalidate: Math.ceil(ttl / 1000) })());
export const eventWeatherService = createWeatherService(createOpenMeteoProvider(), cache);
