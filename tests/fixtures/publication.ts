import { EMPTY_EVENT_DRAFT, type EventDraft } from "../../lib/event-drafts";
import { EMPTY_DRAFT_ARTWORK } from "../../lib/event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS } from "../../lib/event-draft-settings";
import type { PublicationSnapshot } from "../../lib/event-publication";
export const eventId = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
export const otherEventId = "7ac5edab-22aa-447d-8931-91132a16798a";
export const eventSlug = `event-${eventId}`;
export const draft: EventDraft = { ...EMPTY_EVENT_DRAFT, id: eventId, status: "draft", revision: 2, title: "Garden Supper", hostName: "Test Host", description: "An evening together.", address: "123 Example Lane", venue: "The garden", cityLabel: "Example City", timeZone: "America/Los_Angeles", startsAtUtc: "2026-11-08T01:00:00.000Z", endsAtUtc: "2026-11-08T04:00:00.000Z", createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
export const snapshot: PublicationSnapshot = {
  details: draft, artwork: EMPTY_DRAFT_ARTWORK, coordinates: null,
  settings: { rsvp: { maxPartySize: 4, allowComments: false, guestListDefaultVisible: false }, features: { ...DEFAULT_DRAFT_SETTINGS.features, playlist: true, questions: true, updates: true, polls: true } },
};
export const versions = { details: 2, artwork: 0, settings: 3, publication: 0 };
export const publication = { id: eventId, slug: eventSlug, snapshot, revision: 1, publishedAt: "2026-10-06T12:00:00Z" };
