import "server-only";
import { MUSIC_SEARCH, type MusicAttribution, type MusicTrack } from "../../music";
import { MusicError, type MusicProvider } from "./provider";
import { blockMusicProvider, consumeMusicQuota } from "./rate-limit";

export const SPOTIFY_ATTRIBUTION: MusicAttribution = {
  name: "Spotify", logoUrl: "/music/spotify-logo-black.svg", logoWidth: 96, logoHeight: 26,
  browseUrl: "https://open.spotify.com/",
};

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue { return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {}; }
function metadata(value: unknown, limit: number): string | null { return typeof value === "string" && value.trim() && value.length <= limit ? value : null; }
const trackIdPattern = /^[A-Za-z0-9]{22}$/;

export function normalizeSpotifyTrack(value: unknown): MusicTrack | null {
  const track = object(value);
  if (typeof track.id !== "string" || !trackIdPattern.test(track.id) || track.type !== "track" || track.is_local === true) return null;
  const songTitle = metadata(track.name, 512);
  const artists = Array.isArray(track.artists) ? track.artists.map((item) => metadata(object(item).name, 512)) : [];
  if (!songTitle || !artists.length || artists.some((name) => !name)) return null;
  const artist = artists.join(", ");
  if (artist.length > 1024) return null;
  const album = object(track.album);
  const images = Array.isArray(album.images) ? album.images.map(object) : [];
  // Original CDN URL only. No proxy, cropping, resizing service, or recoloring.
  const artwork = images.find((item) => typeof item.url === "string" && item.url.length <= 2048 && /^https:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+$/.test(item.url));
  return {
    provider: "spotify", providerTrackId: track.id, songTitle, artist,
    album: metadata(album.name, 512), artworkUrl: artwork ? String(artwork.url) : null,
    externalUrl: `https://open.spotify.com/track/${track.id}`,
    explicit: typeof track.explicit === "boolean" ? track.explicit : null,
  };
}

export function createSpotifyProvider(fetcher: typeof fetch = fetch, now = Date.now): MusicProvider {
  let token: { value: string; expiresAt: number } | undefined;
  let tokenRequest: Promise<string> | undefined;
  let cooldownUntil = 0;

  async function request(url: string, options: RequestInit): Promise<Response> {
    if (cooldownUntil > now()) throw new MusicError("rate_limited", Math.ceil((cooldownUntil - now()) / 1000));
    await consumeMusicQuota("provider:spotify", 90, "cooldown:spotify");
    let response: Response;
    try { response = await fetcher(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) }); }
    catch { throw new MusicError("unavailable"); }
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const parsed = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - now()) / 1000) : NaN;
      const seconds = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 604800)) : 60;
      cooldownUntil = now() + seconds * 1000;
      await blockMusicProvider("spotify", seconds);
      throw new MusicError("rate_limited", seconds);
    }
    return response;
  }

  async function accessToken() {
    if (token && token.expiresAt > now()) return token.value;
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      const id = process.env.SPOTIFY_CLIENT_ID?.trim();
      const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
      if (!id || !secret) throw new MusicError("unavailable");
      const response = await request("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (!response.ok) throw new MusicError("unavailable");
      const data = object(await response.json());
      if (typeof data.access_token !== "string" || !data.access_token || typeof data.expires_in !== "number" || data.expires_in <= 0) throw new MusicError("unavailable");
      token = { value: data.access_token, expiresAt: now() + Math.max(0, data.expires_in - 60) * 1000 };
      return token.value;
    })();
    try { return await tokenRequest; } finally { tokenRequest = undefined; }
  }

  async function api(path: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const currentToken = await accessToken();
      const response = await request(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${currentToken}` } });
      if (response.status === 401 && attempt === 0) { if (token?.value === currentToken) token = undefined; continue; }
      if (response.status === 404) throw new MusicError("not_found");
      if (!response.ok) throw new MusicError("unavailable");
      return object(await response.json());
    }
    throw new MusicError("unavailable");
  }

  function market() { return /^[A-Z]{2}$/.test(process.env.SPOTIFY_MARKET ?? "") ? process.env.SPOTIFY_MARKET! : "US"; }
  return {
    id: "spotify", attribution: SPOTIFY_ATTRIBUTION,
    isConfigured: () => Boolean(process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim()),
    isTrackId: (id) => trackIdPattern.test(id),
    async search(query) {
      const params = new URLSearchParams({ q: query, type: "track", limit: String(MUSIC_SEARCH.limit), market: market() });
      const data = await api(`search?${params}`);
      const items = object(data.tracks).items;
      if (!Array.isArray(items)) throw new MusicError("unavailable");
      const tracks = items.map(normalizeSpotifyTrack).filter((track): track is MusicTrack => track !== null);
      return tracks.filter((track, index) => tracks.findIndex((other) => other.providerTrackId === track.providerTrackId) === index).slice(0, MUSIC_SEARCH.limit);
    },
    async getTrack(id) {
      if (!trackIdPattern.test(id)) throw new MusicError("not_found");
      const track = normalizeSpotifyTrack(await api(`tracks/${encodeURIComponent(id)}?market=${market()}`));
      if (!track) throw new MusicError("not_found");
      return track;
    },
  };
}
