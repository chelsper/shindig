import "server-only";
import { createHash } from "node:crypto";
import { parseEventLocation, type AddressMatch } from "../event-location";

export class LocationError extends Error {}
export class LocationConflictError extends LocationError {}
const cache = new Map<string, { until: number; matches: AddressMatch[] }>();
const pending = new Map<string, Promise<AddressMatch[]>>();
let windowStart = 0, requests = 0, cooldown = 0;
const unavailable = () => new LocationError("Address search is taking a break. Try again shortly, or enter coordinates manually.");

export async function searchAddress(address: string): Promise<AddressMatch[]> {
  const query = address.trim();
  if (!query || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) throw new LocationError("Automatic matching supports U.S. addresses up to 100 characters. You can also enter coordinates manually.");
  const key = createHash("sha256").update(query.toLowerCase()).digest("hex"), now = Date.now();
  const saved = cache.get(key);
  if (saved && saved.until > now) return saved.matches.map((match) => ({ ...match }));
  if (pending.has(key)) return pending.get(key)!;
  if (now < cooldown) throw unavailable();
  if (now - windowStart >= 60_000) { requests = 0; windowStart = now; }
  if (requests >= 30 || pending.size >= 5) throw new LocationError("A few address searches are already in progress. Please try again in a minute.");
  requests++;
  const task = (async () => {
    try {
      const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
      url.search = new URLSearchParams({ address: query, benchmark: "Public_AR_Current", format: "json" }).toString();
      const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
      if (response.status === 429) { cooldown = Date.now() + 60_000; throw unavailable(); }
      if (!response.ok) throw unavailable();
      const text = await response.text();
      if (text.length > 100_000) throw unavailable();
      const body = JSON.parse(text);
      if (!Array.isArray(body?.result?.addressMatches)) throw unavailable();
      const matches: AddressMatch[] = [];
      for (const match of body.result.addressMatches.slice(0, 5)) {
        const parsed = parseEventLocation({ address: query, matchedAddress: match?.matchedAddress, latitude: match?.coordinates?.y, longitude: match?.coordinates?.x, source: "census" }, query);
        if (parsed) matches.push({ matchedAddress: parsed.matchedAddress, latitude: parsed.latitude, longitude: parsed.longitude });
      }
      // Bounded, ephemeral server cache; no address is logged or stored in Neon.
      for (const [key, entry] of cache) if (entry.until <= Date.now()) cache.delete(key);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + 15 * 60_000, matches });
      return matches.map((match) => ({ ...match }));
    } catch (error) { throw error instanceof LocationError ? error : unavailable(); }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
