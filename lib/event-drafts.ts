import { eventLocalToUtc, normalizeTimeZone } from "./event-date-time";

export const DRAFT_LIMITS = { title: 180, description: 2000, hostName: 120, venue: 120, address: 300, cityLabel: 100 } as const;
export type EventDraftFields = Record<keyof typeof DRAFT_LIMITS, string> & {
  timeZone: string; startsAtUtc: string | null; endsAtUtc: string | null;
};
export type EventDraft = EventDraftFields & { id: string; status: "draft"; revision: number; createdAt: string; updatedAt: string };
export type EventDraftSummary = Pick<EventDraft, "id" | "title" | "startsAtUtc" | "timeZone" | "cityLabel" | "updatedAt">;
export const EMPTY_EVENT_DRAFT: EventDraftFields = {
  title: "", description: "", hostName: "", venue: "", address: "", cityLabel: "",
  timeZone: "America/New_York", startsAtUtc: null, endsAtUtc: null,
};
export const isDraftId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export const isDraftRevision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2147483647;
type Validation = { ok: true; fields: EventDraftFields } | { ok: false; message: string };

export function validateEventDraft(input: unknown): Validation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please check the event details." };
  const row = input as Record<string, unknown>;
  const text: Record<string, string> = {};
  const labels = { title: "Event name", description: "Description", hostName: "Host name", venue: "Venue", address: "Address", cityLabel: "City / area" };
  for (const key of Object.keys(DRAFT_LIMITS) as (keyof typeof DRAFT_LIMITS)[]) {
    const value = row[key];
    if (typeof value !== "string" || value.trim().length > DRAFT_LIMITS[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return { ok: false, message: `${labels[key]} must be at most ${DRAFT_LIMITS[key]} characters with no unsupported control characters.` };
    text[key] = value.trim();
  }
  if (!text.title) return { ok: false, message: "Give your event a name before saving." };
  const timeZone = normalizeTimeZone(row.timeZone);
  if (!timeZone) return { ok: false, message: "Choose a valid event timezone." };
  for (const key of ["startsAtUtc", "endsAtUtc"] as const) {
    const value = row[key];
    if (value !== null && (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)) return { ok: false, message: "Use valid event dates between 2000 and 2099." };
  }
  const startsAtUtc = row.startsAtUtc as string | null, endsAtUtc = row.endsAtUtc as string | null;
  if (endsAtUtc && !startsAtUtc) return { ok: false, message: "Add a start time before choosing an end time." };
  if (startsAtUtc && endsAtUtc && (Date.parse(endsAtUtc) <= Date.parse(startsAtUtc) || Date.parse(endsAtUtc) - Date.parse(startsAtUtc) > 7 * 86400000)) return { ok: false, message: "The end time must be after the start, within seven days." };
  return { ok: true, fields: { title: text.title, description: text.description, hostName: text.hostName, venue: text.venue, address: text.address, cityLabel: text.cityLabel, timeZone, startsAtUtc, endsAtUtc } };
}

export function validateDraftForm(input: unknown): Validation {
  if (!input || typeof input !== "object") return { ok: false, message: "Please check the event details." };
  const row = input as Record<string, unknown>;
  const timeZone = normalizeTimeZone(row.timeZone);
  if (!timeZone) return { ok: false, message: "Choose a valid event timezone." };
  const times: Record<string, string | null> = {};
  for (const key of ["startsAtLocal", "endsAtLocal"]) {
    const value = row[key];
    if (typeof value !== "string") return { ok: false, message: "Please check the event dates." };
    times[key] = value === "" ? null : eventLocalToUtc(value, timeZone);
    if (value !== "" && !times[key]) return { ok: false, message: "Choose a valid time in the event’s timezone. Times skipped or repeated during daylight saving changes need a different time." };
  }
  return validateEventDraft({ ...row, timeZone, startsAtUtc: times.startsAtLocal, endsAtUtc: times.endsAtLocal });
}
