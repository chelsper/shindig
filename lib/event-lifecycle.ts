export type EventVisibility = "published" | "unpublished";
export type EventLifecycle = { visibility: EventVisibility; rsvpsOpen: boolean };
export type LifecycleAction = "close-rsvps" | "reopen-rsvps" | "unpublish";

export const RSVP_CLOSED_MESSAGE = "The host has closed RSVPs and guest changes for now. Please contact your host if your plans change.";

export function isLifecycleAction(value: unknown): value is LifecycleAction {
  return value === "close-rsvps" || value === "reopen-rsvps" || value === "unpublish";
}

export function eventStatus(lifecycle: EventLifecycle | null): string {
  if (!lifecycle) return "Draft";
  if (lifecycle.visibility === "unpublished") return "Unpublished";
  return lifecycle.rsvpsOpen ? "Published" : "Published · RSVPs closed";
}

export function hasUnpublishedChanges(saved: { details: number; artwork: number; settings: number }, source: { details: number; artwork: number; settings: number }) {
  return saved.details !== source.details || saved.artwork !== source.artwork || saved.settings !== source.settings;
}
