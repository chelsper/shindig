import type { EventVisibility } from "./event-lifecycle";

// Presentation only; never used to authorize a write or to bypass publication.
export type DraftPublicationStatus = { visibility: EventVisibility | null; hasUnpublishedChanges: boolean };
export type SaveStatusInput = { publication?: DraftPublicationStatus | null; dirty?: boolean; pending?: boolean; conflict?: boolean; failed?: boolean; savedSinceLoad?: boolean; newDraft?: boolean };
export function eventSaveStatus({ publication, dirty, pending, conflict, failed, savedSinceLoad, newDraft }: SaveStatusInput) {
  const tone = "private" as const;
  if (pending) return { tone, label: "Working…", detail: "Please wait for confirmation. Nothing is published by saving a draft." };
  if (conflict) return { tone: "warning" as const, label: "Reopen the latest draft", detail: "This version needs checking before you save or publish." };
  if (failed) return { tone: "warning" as const, label: "Changes need attention", detail: "The last action did not confirm a save. Your live event has not been updated." };
  if (dirty) return { tone: "warning" as const, label: "Unsaved changes", detail: "Save draft before previewing the saved version. Guests cannot see these edits." };
  if (newDraft) return { tone, label: "Private draft", detail: "Save the event basics to continue. There is no live guest page yet." };
  if (publication?.visibility === "archived") return { tone, label: "Archived — not live", detail: "Changes stay private. Restore the event before publishing again." };
  if (publication?.visibility === "unpublished") return { tone, label: "Unpublished — not live", detail: "Changes stay private. Guest links work again only after you republish." };
  if (savedSinceLoad || publication?.hasUnpublishedChanges || publication?.visibility === null) return { tone, label: "Saved privately — changes not published", detail: publication?.visibility === "published" ? "Guests still see the last published version. Review changes before updating it." : "Preview your saved draft, then explicitly publish when you’re ready." };
  if (publication?.visibility === "published") return { tone: "live" as const, label: "Live — guests see this version", detail: "Saved details, artwork and settings match the published event. New edits stay private until published." };
  return { tone, label: "Saved draft — live status unavailable", detail: "You can keep editing. Reopen the review to check what guests currently see." };
}

export function hubSaveNotice(live: boolean, behavior: "immediate" | "moderated" | "private" = "immediate") {
  if (behavior === "private") return "Saves privately. Guests cannot see this item until you explicitly make it ready or publish it.";
  if (!live) return "Saves privately. Guests can see approved, ready content only after this section is enabled and the event is published.";
  if (behavior === "moderated") return "Visibility changes take effect immediately on save. Only approved answers are public; unapproved answers stay private.";
  return "Updates the live Hub immediately when saved. No separate event publication is needed.";
}
