import { isDraftId, isDraftRevision } from "./event-drafts";

export type DeletionReview = {
  id: string; title: string; details: number; artwork: number; settings: number; publication: number;
  visibility: "published" | "unpublished" | "archived" | null;
};
export type DeletionReceipt = { id: string; deletedAt: string; artworkCleanedAt: string | null; cleanupReady: boolean };
export type DeletionResult = { ok: true; receipt: DeletionReceipt } | { ok: false; message: string };

export function parseDeletionInput(value: unknown): (DeletionReview & { confirmed: true; phrase: "DELETE" }) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!isDraftId(v.id) || typeof v.title !== "string" || !v.title.trim() || v.title.length > 180 ||
    ![v.details, v.artwork, v.settings, v.publication].every(isDraftRevision) || Number(v.details) < 1 ||
    v.confirmed !== true || v.phrase !== "DELETE") return null;
  // Visibility is presentation only; deletion always covers the entire event.
  return { id: v.id.toLowerCase(), title: v.title, details: v.details as number, artwork: v.artwork as number,
    settings: v.settings as number, publication: v.publication as number, visibility: null, confirmed: true, phrase: "DELETE" };
}
