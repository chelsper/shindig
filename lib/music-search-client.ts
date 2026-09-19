import { hasMeaningfulMusicQuery, MUSIC_SEARCH, normalizeMusicQuery, type MusicSearchResult, type MusicSearchResponse } from "./music";

export type MusicSearchState =
  | { status: "idle" | "waiting" | "loading" }
  | { status: "success"; result: MusicSearchResult }
  | { status: "error"; message: string };

const unavailable = "Music search is taking a quick break. Please try again soon. Your saved suggestions are still here.";

// The browser knows only Shindig's contract. Cancelling also guards against a
// late response from a transport that ignores AbortSignal.
export function createMusicSearchClient(fetcher: typeof fetch = fetch, now = Date.now) {
  let cooldownUntil = 0;
  return {
    run(input: string, update: (state: MusicSearchState) => void) {
      const query = normalizeMusicQuery(input);
      if (!hasMeaningfulMusicQuery(query) || query.length > MUSIC_SEARCH.maxCharacters) return () => {};
      const controller = new AbortController();
      let active = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const debounce = setTimeout(async () => {
        if (cooldownUntil > now()) {
          update({ status: "error", message: `The music catalog needs a breather. Try again in ${Math.ceil((cooldownUntil - now()) / 1000)} seconds.` });
          return;
        }
        update({ status: "loading" });
        timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetcher(`/api/music/search?${new URLSearchParams({ q: query })}`, { signal: controller.signal, cache: "no-store" });
          const data = await response.json() as MusicSearchResponse;
          if (!active) return;
          if (response.status === 429) {
            const seconds = Number(response.headers.get("Retry-After")) || (!data.ok && data.retryAfter) || 60;
            cooldownUntil = now() + Math.min(Math.max(seconds, 1), 604800) * 1000;
          }
          if (!response.ok || !data.ok) {
            update({ status: "error", message: !data.ok && typeof data.message === "string" ? data.message : unavailable });
          } else {
            update({ status: "success", result: { tracks: data.tracks, attribution: data.attribution } });
          }
        } catch {
          if (active) update({ status: "error", message: unavailable });
        } finally {
          clearTimeout(timeout);
        }
      }, MUSIC_SEARCH.debounceMs);
      return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
    },
  };
}
