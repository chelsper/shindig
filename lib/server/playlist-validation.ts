import "server-only";

import { PLAYLIST_LIMITS, type PlaylistSelection } from "../playlist";

type ValidationResult =
  | { success: true; data: PlaylistSelection }
  | { success: false; message: string };

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validatePlaylistSuggestion(input: unknown): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Please check your song suggestion." };
  }

  const fields = input as Record<string, unknown>;
  if (typeof fields.provider !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(fields.provider)
    || typeof fields.providerTrackId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(fields.providerTrackId)) {
    return { success: false, message: "Please choose a song from the search results." };
  }
  if (fields.suggestedBy != null && typeof fields.suggestedBy !== "string") {
    return { success: false, message: "Please check your name, or leave it blank." };
  }

  const suggestedBy = typeof fields.suggestedBy === "string"
    ? cleanText(fields.suggestedBy) || null
    : null;

  if (suggestedBy && suggestedBy.length > PLAYLIST_LIMITS.suggestedBy) {
    return { success: false, message: `Keep your name to ${PLAYLIST_LIMITS.suggestedBy} characters or fewer.` };
  }

  // Never accept browser-supplied titles, artwork URLs, or event identifiers.
  return { success: true, data: { provider: fields.provider, providerTrackId: fields.providerTrackId, suggestedBy } };
}
