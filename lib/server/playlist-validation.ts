import "server-only";

import { PLAYLIST_LIMITS, type PublicPlaylistSuggestion } from "../playlist";

type ValidationResult =
  | { success: true; data: PublicPlaylistSuggestion }
  | { success: false; message: string };

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validatePlaylistSuggestion(input: unknown): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Please check your song suggestion." };
  }

  const fields = input as Record<string, unknown>;
  if (typeof fields.songTitle !== "string" || !fields.songTitle.trim()) {
    return { success: false, message: "Please enter a song title." };
  }
  if (typeof fields.artist !== "string" || !fields.artist.trim()) {
    return { success: false, message: "Please enter the artist." };
  }
  if (fields.suggestedBy != null && typeof fields.suggestedBy !== "string") {
    return { success: false, message: "Please check your name, or leave it blank." };
  }

  const songTitle = cleanText(fields.songTitle);
  const artist = cleanText(fields.artist);
  const suggestedBy = typeof fields.suggestedBy === "string"
    ? cleanText(fields.suggestedBy) || null
    : null;

  if (songTitle.length > PLAYLIST_LIMITS.songTitle) {
    return { success: false, message: `Keep the song title to ${PLAYLIST_LIMITS.songTitle} characters or fewer.` };
  }
  if (artist.length > PLAYLIST_LIMITS.artist) {
    return { success: false, message: `Keep the artist to ${PLAYLIST_LIMITS.artist} characters or fewer.` };
  }
  if (suggestedBy && suggestedBy.length > PLAYLIST_LIMITS.suggestedBy) {
    return { success: false, message: `Keep your name to ${PLAYLIST_LIMITS.suggestedBy} characters or fewer.` };
  }

  return { success: true, data: { songTitle, artist, suggestedBy } };
}
