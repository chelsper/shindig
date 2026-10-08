import { DRAFT_LIMITS, isDraftId } from "./event-drafts";
import { OYSTER_ROAST_EVENT } from "./oyster-roast-event";

export const isDuplicationSource = (value: unknown): value is string => value === OYSTER_ROAST_EVENT.slug || isDraftId(value);
export const duplicateEventPath = (source: string) => `/admin/events/duplicate/${source}`;
export const suggestedDuplicateTitle = (title: string) => `${title.slice(0, DRAFT_LIMITS.title - 7).trimEnd()} (copy)`;
export type DuplicateEventInput = { source: string; requestId: string; fingerprint: string; title: string; confirmed: true };
export class EventDuplicationError extends Error {}

export function validateDuplicateEventInput(input: unknown): DuplicateEventInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (!isDuplicationSource(row.source) || !isDraftId(row.requestId) || row.source.toLowerCase() === row.requestId.toLowerCase() ||
      typeof row.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.fingerprint) || row.confirmed !== true ||
      typeof row.title !== "string" || !row.title.trim() || row.title.trim().length > DRAFT_LIMITS.title || /[\u0000-\u001f\u007f]/.test(row.title)) return null;
  return { source: row.source.toLowerCase(), requestId: row.requestId.toLowerCase(), fingerprint: row.fingerprint, title: row.title.trim(), confirmed: true };
}
