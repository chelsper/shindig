export type EventVisibility = "published" | "unpublished" | "archived";
export type EventLifecycle = { visibility: EventVisibility; rsvpsOpen: boolean };
export type LifecycleAction = "close-rsvps" | "reopen-rsvps" | "unpublish" | "archive" | "restore";

export const RSVP_CLOSED_MESSAGE = "The host has closed RSVPs and guest changes for now. Please contact your host if your plans change.";

export function isLifecycleAction(value: unknown): value is LifecycleAction {
  return value === "close-rsvps" || value === "reopen-rsvps" || value === "unpublish" || value === "archive" || value === "restore";
}

export function eventStatus(lifecycle: EventLifecycle | null): string {
  if (!lifecycle) return "Draft";
  if (lifecycle.visibility === "archived") return "Archived";
  if (lifecycle.visibility === "unpublished") return "Unpublished";
  return lifecycle.rsvpsOpen ? "Published" : "Published · RSVPs closed";
}

export function availableLifecycleActions(lifecycle: EventLifecycle): LifecycleAction[] {
  if (lifecycle.visibility === "archived") return ["restore"];
  return [lifecycle.rsvpsOpen ? "close-rsvps" : "reopen-rsvps", ...(lifecycle.visibility === "published" ? ["unpublish" as const] : []), "archive"];
}

export function hasUnpublishedChanges(saved: { details: number; artwork: number; settings: number }, source: { details: number; artwork: number; settings: number }) {
  return saved.details !== source.details || saved.artwork !== source.artwork || saved.settings !== source.settings;
}
