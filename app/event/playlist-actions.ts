"use server";

import { revalidatePath } from "next/cache";

import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { createPlaylistSuggestion } from "../../lib/server/playlist";
import { validatePlaylistSuggestion } from "../../lib/server/playlist-validation";

export type PlaylistSubmissionResult =
  | { ok: true; outcome: "added" | "duplicate" }
  | { ok: false; message: string };

export async function submitPlaylistSuggestion(input: unknown): Promise<PlaylistSubmissionResult> {
  if (!OYSTER_ROAST_EVENT.features.playlist) {
    return { ok: false, message: "Song suggestions aren’t available for this event." };
  }

  const validation = validatePlaylistSuggestion(input);
  if (!validation.success) return { ok: false, message: validation.message };

  try {
    const outcome = await createPlaylistSuggestion(validation.data);
    revalidatePath(OYSTER_ROAST_EVENT.eventHub.path);
    revalidatePath("/admin/playlist");
    return { ok: true, outcome };
  } catch {
    console.error("Playlist submission failed.");
    return { ok: false, message: "We couldn’t add your song. Please try again in a moment." };
  }
}
