import { validateEventDraft, type EventDraftFields } from "./event-drafts";
import { validateDraftArtwork, type DraftArtwork } from "./event-draft-artwork";
import { validateDraftSettings, type DraftSettings } from "./event-draft-settings";
import { draftEventSlug, eventPaths } from "./event-routes";
import { SHINDIG_SITE } from "./site";
import type { EventConfiguration } from "./oyster-roast-event";

export type Coordinates = { latitude: number; longitude: number };
export type PublicationSnapshot = {
  details: EventDraftFields; artwork: DraftArtwork; settings: DraftSettings;
  coordinates: Coordinates | null;
};
export type PublicationVersions = { details: number; artwork: number; settings: number; publication: number };

export function publicationProblems(snapshot: PublicationSnapshot) {
  const problems: string[] = [];
  if (!snapshot.details.startsAtUtc) problems.push("Add the event start date and time.");
  if (!snapshot.details.endsAtUtc) problems.push("Add an end time for accurate calendar entries.");
  if (!snapshot.details.address.trim()) problems.push("Add the event address.");
  if (snapshot.settings.features.weather && !snapshot.coordinates) problems.push("Confirm the event’s latitude and longitude, or turn Weather off.");
  return problems;
}

export function parseCoordinates(input: unknown): Coordinates | null {
  if (!input || typeof input !== "object") return null;
  const { latitude, longitude } = input as Record<string, unknown>;
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
}

export function parsePublicationSnapshot(id: string, input: unknown): PublicationSnapshot {
  if (!input || typeof input !== "object") throw new Error("Invalid publication.");
  const row = input as Record<string, unknown>;
  const details = validateEventDraft(row.details), artwork = validateDraftArtwork(id, row.artwork), settings = validateDraftSettings(row.settings);
  const coordinates = parseCoordinates(row.coordinates);
  if (!details.ok || !artwork.ok || !settings.ok || (row.coordinates !== null && !coordinates)) throw new Error("Invalid publication.");
  const snapshot = { details: details.fields, artwork: artwork.settings, settings: settings.settings, coordinates };
  if (publicationProblems(snapshot).length) throw new Error("Incomplete publication.");
  return snapshot;
}

// Only public presentation leaves this function. Storage paths, draft revisions,
// admin data and unpublished edits never become client props.
export function publicationEvent(id: string, snapshot: PublicationSnapshot): EventConfiguration {
  const { details: d, artwork: art, settings, coordinates } = snapshot;
  const slug = draftEventSlug(id), paths = eventPaths(slug);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: d.timeZone }).format(new Date(d.startsAtUtc!));
  const image = (kind: "invitation" | "header") => `${paths.invitation}/artwork/${kind}`;
  return {
    slug, title: d.title, hostTitle: d.title, description: d.description, venue: d.venue,
    address: d.address, cityLabel: d.cityLabel, coordinates, timeZone: d.timeZone,
    startsAtUtc: d.startsAtUtc!, endsAtUtc: d.endsAtUtc!,
    dateLabel: format({ dateStyle: "full" }), shortDateLabel: format({ weekday: "long", month: "long", day: "numeric" }),
    timeLabel: format({ hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
    websiteUrl: new URL(paths.invitation, SHINDIG_SITE.url).toString(),
    calendarUid: `${slug}@haveashindig.com`, calendarFilename: "shindig-event.ics",
    features: settings.features, rsvp: settings.rsvp,
    invitation: { eyebrow: d.hostName ? `Hosted by ${d.hostName}` : "You’re invited", timeNote: "", rsvpHeading: "Will you join us?",
      imageUrl: art.invitation.path ? image("invitation") : "", imageAlt: art.invitation.alt, imageWidth: 1429, imageHeight: 2000 },
    eventHub: { path: paths.hub, headerImage: {
      url: art.header.path || art.invitation.path ? image("header") : "", alt: art.header.path ? art.header.alt : art.invitation.alt,
      focalX: art.header.focalX, focalY: art.header.focalY, zoomPercent: art.header.zoomPercent,
    } },
  };
}
