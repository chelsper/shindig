import "server-only";
import { isDraftId } from "../event-drafts";
import { draftEventSlug } from "../event-routes";
import { hasUnpublishedChanges } from "../event-lifecycle";
import type { DraftPublicationStatus } from "../event-save-status";
import { getEventDraft } from "./event-drafts";
import { getDraftArtwork } from "./event-draft-artwork";
import { getDraftSettings } from "./event-draft-settings";
import { getHostEventPublication } from "./event-publications";

// Called only after the route has authorized and loaded this host's draft.
// Reuse its revision reads; all additional reads retain their ownership checks.
export async function getDraftPublicationStatus(id: string, known: Partial<{ details: number; artwork: number; settings: number }> = {}): Promise<DraftPublicationStatus | null> {
  if (!isDraftId(id)) return null;
  try {
    const [details, artwork, settings, live] = await Promise.all([
      known.details ?? getEventDraft(id).then(row => row?.revision),
      known.artwork ?? getDraftArtwork(id).then(row => row?.revision),
      known.settings ?? getDraftSettings(id).then(row => row?.revision),
      getHostEventPublication(draftEventSlug(id)),
    ]);
    if (details == null || artwork == null || settings == null) return null;
    return { visibility: live?.visibility ?? null, hasUnpublishedChanges: !live || hasUnpublishedChanges({ details, artwork, settings }, live.sourceRevisions) };
  } catch { return null; } // Never equate a failed status read with a live or unpublished event.
}
