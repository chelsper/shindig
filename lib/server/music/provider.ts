import "server-only";
import type { MusicAttribution, MusicTrack } from "../../music";

export interface MusicProvider {
  id: string;
  attribution: MusicAttribution;
  isConfigured(): boolean;
  isTrackId(value: string): boolean;
  search(query: string): Promise<MusicTrack[]>;
  getTrack(id: string): Promise<MusicTrack>;
}

export class MusicError extends Error {
  constructor(public code: "unavailable" | "rate_limited" | "not_found", public retryAfter?: number) {
    super(code);
    this.name = "MusicError";
  }
}

export function musicErrorResponse(error: unknown) {
  if (error instanceof MusicError && error.code === "rate_limited") {
    return { ok: false as const, message: "The music catalog needs a breather. Please try again shortly.", retryAfter: error.retryAfter ?? 60 };
  }
  if (error instanceof MusicError && error.code === "not_found") {
    return { ok: false as const, message: "That track is no longer available. Please search for another." };
  }
  return { ok: false as const, message: "Music search is taking a quick break. Please try again soon. Your saved suggestions are still here." };
}
