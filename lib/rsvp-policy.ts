export type RsvpLimits = { deadlineAtUtc?: string | null; capacity?: number | null };
export type RsvpAvailability = "open" | "full" | "deadline" | "closed";
export const MAX_EVENT_CAPACITY = 10000;
export const RSVP_DEADLINE_MESSAGE = "The RSVP deadline has passed. Please check with your host if your plans have changed.";
export const RSVP_CAPACITY_MESSAGE = "There isn’t enough room for that party size right now. Try a smaller party or check with your host.";
export class RsvpAdmissionError extends Error {}

// Old published snapshots omit these optional fields. Never reinterpret those
// snapshots as having limits; normalized new settings explicitly store nulls.
export function validRsvpDeadline(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function rsvpAvailability(open: boolean, limits: RsvpLimits, attending = 0, now = Date.now()): RsvpAvailability {
  if (!open) return "closed";
  if (limits.deadlineAtUtc && now >= Date.parse(limits.deadlineAtUtc)) return "deadline";
  if (limits.capacity != null && attending >= limits.capacity) return "full";
  return "open";
}
export function rsvpDeadlineLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
