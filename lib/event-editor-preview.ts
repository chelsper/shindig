import { normalizeTimeZone, eventLocalToUtc } from "./event-date-time";
import { validateDraftForm, type EventDraftFields } from "./event-drafts";
import type { DraftArtwork } from "./event-draft-artwork";
import type { DraftSettingsRecord } from "./event-draft-settings";

export type EventEditorFields = EventDraftFields & { startsAtLocal: string; endsAtLocal: string };
export type EventEditorPreviewContext = { artwork: DraftArtwork; settings: DraftSettingsRecord };

// Display only: local form values never write to storage or borrow live-event
// information. Use the same timezone/DST rules as the server-side save action.
export function eventEditorPreview(id: string, fields: EventEditorFields) {
  const timeZone = normalizeTimeZone(fields.timeZone);
  const start = timeZone && fields.startsAtLocal ? eventLocalToUtc(fields.startsAtLocal, timeZone) : null;
  const end = timeZone && fields.endsAtLocal ? eventLocalToUtc(fields.endsAtLocal, timeZone) : null;
  const validation = validateDraftForm({ ...fields, title: fields.title.trim() || "Your gathering" });
  const draft: EventDraftFields & { id: string } = {
    id, title: fields.title.trim() || "Your gathering", description: fields.description.trim(),
    hostName: fields.hostName.trim(), venue: fields.venue.trim(), address: fields.address.trim(), cityLabel: fields.cityLabel.trim(),
    timeZone: timeZone ?? "UTC", startsAtUtc: start, endsAtUtc: end,
  };
  return { draft, issue: validation.ok ? null : validation.message };
}
