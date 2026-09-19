import { hasMeaningfulMusicQuery, MUSIC_SEARCH, normalizeMusicQuery } from "../../../../lib/music";
import { OYSTER_ROAST_EVENT } from "../../../../lib/oyster-roast-event";
import { isMusicSearchConfigured, searchMusic } from "../../../../lib/server/music";
import { MusicError, musicErrorResponse } from "../../../../lib/server/music/provider";
import { throttleMusicRequest } from "../../../../lib/server/music/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (!OYSTER_ROAST_EVENT.features.playlist) return Response.json({ ok: false, message: "The playlist isn’t available for this event." }, { status: 404, headers });
  const query = normalizeMusicQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (query.length > MUSIC_SEARCH.maxCharacters || !hasMeaningfulMusicQuery(query)) {
    return Response.json({ ok: false, message: "Search with 3–100 characters, including at least 3 letters or numbers." }, { status: 400, headers });
  }
  try {
    if (!isMusicSearchConfigured()) throw new MusicError("unavailable");
    await throttleMusicRequest("search", request.headers);
    return Response.json({ ok: true, ...await searchMusic(query) }, { headers });
  } catch (error) {
    const result = musicErrorResponse(error);
    const retry = "retryAfter" in result ? result.retryAfter : undefined;
    return Response.json(result, { status: retry ? 429 : 503, headers: { ...headers, ...(retry ? { "Retry-After": String(retry) } : {}) } });
  }
}
