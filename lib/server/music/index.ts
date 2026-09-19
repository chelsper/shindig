import "server-only";
import { createMusicCatalog } from "./catalog";
import { MusicError } from "./provider";
import { createSpotifyProvider } from "./spotify";

// To add a provider, implement MusicProvider and register it here. The guest UI
// consumes the same Shindig contract and never imports a provider implementation.
const primaryCatalog = createMusicCatalog(createSpotifyProvider());
const catalogs = new Map([[primaryCatalog.provider.id, primaryCatalog]]);
export const isMusicSearchConfigured = () => primaryCatalog.provider.isConfigured();
export const musicAttribution = (provider: string | null) => catalogs.get(provider ?? "")?.provider.attribution ?? null;
export const searchMusic = (query: string) => primaryCatalog.search(query);
export async function getMusicTrack(provider: string, id: string) {
  const catalog = catalogs.get(provider);
  if (!catalog) throw new MusicError("not_found");
  return catalog.getTrack(id);
}
