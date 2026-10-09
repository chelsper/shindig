import type { EventDraft } from "./event-drafts";
import { parseEventLocation } from "./event-location";
import type { PublicationSnapshot, Coordinates } from "./event-publication";

export type PublicationIssue = {
  id: "date" | "end" | "location" | "weather" | "deadline";
  message: string;
  destination: string;
};

// Shared by the setup guide, review form and authoritative publication parser.
// Draft validity (including name and date ordering) is checked before this stage.
export function publicationIssues(snapshot: PublicationSnapshot): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  if (!snapshot.details.startsAtUtc) issues.push({ id: "date", message: "Add the event start date and time.", destination: "#draft-date-heading" });
  if (!snapshot.details.endsAtUtc) issues.push({ id: "end", message: "Add an end time for accurate calendar entries.", destination: "#draft-date-heading" });
  if (snapshot.settings.rsvp.deadlineAtUtc && snapshot.details.startsAtUtc && Date.parse(snapshot.settings.rsvp.deadlineAtUtc) > Date.parse(snapshot.details.startsAtUtc)) issues.push({ id: "deadline", message: "Set the RSVP deadline at or before the event starts.", destination: "/settings#rsvp-limits" });
  if (!snapshot.details.address.trim()) issues.push({ id: "location", message: "Add the event address.", destination: "#draft-place-heading" });
  if (snapshot.settings.features.weather && !snapshot.coordinates) issues.push({ id: "weather", message: "Confirm the event’s weather location, or turn Weather off.", destination: "/location" });
  return issues;
}

export function publicationProblems(snapshot: PublicationSnapshot) {
  return publicationIssues(snapshot).map(({ message }) => message);
}

// Only a saved confirmation for this address can become public coordinates.
export function savedWeatherCoordinates(details: Pick<EventDraft, "address" | "location">): Coordinates | null {
  const location = parseEventLocation(details.location, details.address);
  return location ? { latitude: location.latitude, longitude: location.longitude } : null;
}
