import "server-only";
import { WeatherUnavailable } from "./provider";
import { reportWeatherFailure } from "./diagnostics";

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
    let loading: Promise<T> | undefined;
    const loadOnce = () => loading ??= Promise.resolve().then(load);
    entry.promise = Promise.resolve().then(() => persist(cacheKey, ttl, loadOnce)).catch((error) => {
      // Cache infrastructure must not make available provider data unavailable.
      // Reuse the same loader promise if a cache write failed after loading;
      // never repeat a failed provider call here or bypass its cooldown.
      if (!loading) reportWeatherFailure("cache", error);
      return loadOnce();
    }).catch((error) => {
      const failure = error instanceof WeatherUnavailable ? error : new WeatherUnavailable();
      entry.until = now() + Math.max(60, failure.retryAfter) * 1000;
      throw failure;
    });
    entries.set(cacheKey, entry);
    return entry.promise as Promise<T>;
  };
}
