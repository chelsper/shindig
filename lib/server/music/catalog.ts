import "server-only";
import { MUSIC_SEARCH, normalizeMusicQuery, type MusicTrack } from "../../music";
import { MusicError, type MusicProvider } from "./provider";

// Small, short-lived caches; never cache credentials, failed requests, or names.
// In-flight promises coalesce identical requests on a warm server instance.
export function createMusicCatalog(provider: MusicProvider, now = Date.now) {
  const cache = new Map<string, { value: MusicTrack[]; expiresAt: number }>();
  const pending = new Map<string, Promise<MusicTrack[]>>();
  const ttl = 5 * 60 * 1000;
  function put(key: string, value: MusicTrack[]) {
    cache.delete(key);
    cache.set(key, { value, expiresAt: now() + ttl });
    while (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  async function cached(key: string, read: () => Promise<MusicTrack[]>) {
    const found = cache.get(key);
    if (found && found.expiresAt > now()) return found.value;
    cache.delete(key);
    const underway = pending.get(key);
    if (underway) return underway;
    if (pending.size >= 12) throw new MusicError("rate_limited", 2);
    const promise = read().then((value) => { put(key, value); return value; });
    pending.set(key, promise);
    try { return await promise; } finally { pending.delete(key); }
  }
  return {
    provider,
    async search(query: string) {
      if (!provider.isConfigured()) throw new MusicError("unavailable");
      const normalized = normalizeMusicQuery(query);
      const tracks = await cached(`search:${normalized.toLowerCase()}`, async () => {
        const tracks = (await provider.search(normalized)).slice(0, MUSIC_SEARCH.limit);
        for (const track of tracks) put(`track:${track.providerTrackId}`, [track]);
        return tracks;
      });
      return { tracks, attribution: provider.attribution };
    },
    async getTrack(id: string) {
      if (!provider.isConfigured()) throw new MusicError("unavailable");
      if (!provider.isTrackId(id)) throw new MusicError("not_found");
      const tracks = await cached(`track:${id}`, async () => [await provider.getTrack(id)]);
      return tracks[0];
    },
  };
}
