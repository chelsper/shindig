"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { guestEventScope, guestScopeArgs, guestHubPath, guestFeatureEnabled } from "../../lib/server/guest-event";
import { createPlaylistSuggestion } from "../../lib/server/playlist";
import { validatePlaylistSuggestion } from "../../lib/server/playlist-validation";
import { getMusicTrack } from "../../lib/server/music";
import { MusicError, musicErrorResponse } from "../../lib/server/music/provider";
import { throttleMusicRequest } from "../../lib/server/music/rate-limit";

export type PlaylistSubmissionResult =
  | { ok: true; outcome: "added" | "duplicate" }
  | { ok: false; message: string };

export async function submitPlaylistSuggestion(input: unknown, eventSlug?: string): Promise<PlaylistSubmissionResult> {
  const scope = await guestEventScope(eventSlug);
  if (!scope || !guestFeatureEnabled(scope, "playlist")) {
    return { ok: false, message: "Song suggestions aren’t available for this event." };
  }

  const validation = validatePlaylistSuggestion(input);
  if (!validation.success) return { ok: false, message: validation.message };

  try {
    await throttleMusicRequest("add", await headers());
    const { provider, providerTrackId, suggestedBy } = validation.data;
    const track = await getMusicTrack(provider, providerTrackId);
    const outcome = await createPlaylistSuggestion({ ...track, suggestedBy }, ...guestScopeArgs(eventSlug, scope));
    revalidatePath(guestHubPath(scope));
    revalidatePath("/admin/playlist");
    return { ok: true, outcome };
  } catch (error) {
    if (error instanceof MusicError) return musicErrorResponse(error);
    console.error("Playlist submission failed.");
    return { ok: false, message: "We couldn’t add your song. Please try again in a moment." };
  }
}
