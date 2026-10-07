import type { EventFeatures } from "./oyster-roast-event";
import type { EventDraft } from "./event-drafts";
import type { DraftArtwork } from "./event-draft-artwork";
import { publicationIssues } from "./event-readiness";
import type { Coordinates } from "./event-publication";

// Only implemented modules are selectable. These are draft choices, not overrides
// of the canonical live Oyster Roast configuration.
export const DRAFT_HUB_MODULES = [
  { id: "guestList", label: "Guest List", guestLabel: "Who’s Coming", icon: "guests", description: "A shared guest list, with each household in control of its name.", preview: "Attending households who opt in appear here. Hidden names stay private and still count toward attendance." },
  { id: "playlist", label: "Playlist", guestLabel: "Playlist", icon: "playlist", description: "Let guests suggest songs for the soundtrack.", preview: "Guests will be able to search for songs and suggest a favorite. This preview does not search or submit songs." },
  { id: "questions", label: "Ask the Host", guestLabel: "Ask the Host", icon: "questions", description: "Private questions, with host-approved answers shared later.", preview: "Questions go privately to the host. Only answered questions the host chooses to publish appear here; guest names are not displayed." },
  { id: "polls", label: "Polls", guestLabel: "Important Research", icon: "polls", description: "A little friendly input from the crowd.", preview: "The Polls tab appears for guests only when a poll is open or a closed result is approved for display. No poll has been created by this setting." },
  { id: "updates", label: "Host Updates", guestLabel: "Updates", icon: "updates", description: "Keep the little details in one easy-to-find place.", preview: "Published notes from the host will appear here, newest first. This draft has no published updates." },
  { id: "weather", label: "Weather", guestLabel: "Weather", icon: "weather", description: "Conditions at the event’s location, never a guest’s location.", preview: "Typical weather or a forecast will appear when the event’s location and weather setup are confirmed. No weather data is requested in this preview." },
] as const satisfies ReadonlyArray<{ id: keyof EventFeatures; label: string; guestLabel: string; icon: string; description: string; preview: string }>;

export type DraftSettings = {
  rsvp: { maxPartySize: number; allowComments: boolean; guestListDefaultVisible: boolean };
  features: EventFeatures;
};
export type DraftSettingsRecord = { settings: DraftSettings; revision: number };
export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  rsvp: { maxPartySize: 20, allowComments: true, guestListDefaultVisible: true },
  features: { guestList: true, playlist: false, weather: false, questions: false, updates: false, polls: false, photos: false, potluck: false },
};
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOnlyKeys = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).length === keys.length && keys.every((key) => Object.hasOwn(row, key));

export function validateDraftSettings(input: unknown): { ok: true; settings: DraftSettings } | { ok: false; message: string } {
  if (!isObject(input) || !hasOnlyKeys(input, ["rsvp", "features"]) || !isObject(input.rsvp) || !isObject(input.features)) return { ok: false, message: "Please check the RSVP and Event Hub settings." };
  const rsvp = input.rsvp, features = input.features;
  if (!hasOnlyKeys(rsvp, ["maxPartySize", "allowComments", "guestListDefaultVisible"]) || typeof rsvp.maxPartySize !== "number" || !Number.isInteger(rsvp.maxPartySize) || rsvp.maxPartySize < 1 || rsvp.maxPartySize > 20) return { ok: false, message: "Choose a maximum party size from 1 to 20, including the person replying." };
  if (typeof rsvp.allowComments !== "boolean" || typeof rsvp.guestListDefaultVisible !== "boolean") return { ok: false, message: "Please check the comment and guest-list options." };
  const keys = [...DRAFT_HUB_MODULES.map(({ id }) => id), "photos", "potluck"];
  if (!hasOnlyKeys(features, keys) || !keys.every((key) => typeof features[key] === "boolean") || features.photos !== false || features.potluck !== false) return { ok: false, message: "Choose only the available Event Hub features. Photos and Potluck aren’t available yet." };
  return { ok: true, settings: {
    rsvp: { maxPartySize: rsvp.maxPartySize, allowComments: rsvp.allowComments, guestListDefaultVisible: rsvp.guestListDefaultVisible },
    features: { guestList: features.guestList as boolean, playlist: features.playlist as boolean, weather: features.weather as boolean, questions: features.questions as boolean, updates: features.updates as boolean, polls: features.polls as boolean, photos: false, potluck: false },
  } };
}

export function draftReadiness(draft: EventDraft, artwork: DraftArtwork, settings: DraftSettings, settingsSaved: boolean, coordinates: Coordinates | null = null) {
  const base = `/admin/events/${draft.id}`;
  const missing = new Set(publicationIssues({ details: draft, artwork, settings, coordinates }).map(({ id }) => id));
  return [
    { id: "name", label: "Event name", complete: Boolean(draft.title.trim()), required: true, href: base },
    { id: "date", label: "Start date, time & timezone", complete: !missing.has("date"), required: true, href: `${base}#draft-date-heading` },
    { id: "location", label: "Event address", complete: !missing.has("location"), required: true, href: `${base}#draft-place-heading` },
    { id: "settings", label: "RSVP & Hub choices saved", complete: settingsSaved, required: true, href: `${base}/settings` },
    { id: "artwork", label: "Invitation artwork", complete: Boolean(artwork.invitation.path), required: false, href: `${base}/artwork` },
    { id: "end", label: "End time for calendar entries", complete: !missing.has("end"), required: true, href: `${base}#draft-date-heading` },
    ...(settings.features.weather ? [{ id: "weather", label: "Weather location confirmed", complete: !missing.has("weather"), required: true, href: `${base}/publish#weather-location` }] : []),
  ];
}
