import "server-only";
import { WeatherUnavailable } from "./provider";

export type WeatherCache = <T>(key: string, ttl: number, load: () => Promise<T>) => Promise<T>;

// Fixed, server-generated keys only. Time buckets prevent stale-while-revalidate
// results from being relabeled as current. Coalesce simultaneous cold requests.
export function createWeatherCache(persist: WeatherCache = (_key, _ttl, load) => load(), now = Date.now): WeatherCache {
  const entries = new Map<string, { until: number; promise: Promise<unknown> }>();
  return async <T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> => {
    const time = now();
    const bucket = Math.floor(time / ttl);
    const cacheKey = `${key}:${bucket}`;
    const cached = entries.get(cacheKey);
    if (cached && cached.until > time) return cached.promise as Promise<T>;
    for (const [oldKey, entry] of entries) if (entry.until <= time) entries.delete(oldKey);
    if (entries.size >= 64) entries.delete(entries.keys().next().value!);
    const entry = { until: (bucket + 1) * ttl, promise: Promise.resolve(undefined) as Promise<unknown> };
    entry.promise = persist(cacheKey, ttl, load).catch(() => {
      entry.until = now() + 60_000;
      throw new WeatherUnavailable();
    });
    entries.set(cacheKey, entry);
    return entry.promise as Promise<T>;
  };
}
