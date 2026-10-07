import type { EventDraftFields } from "./event-drafts";
import type { PublicationSnapshot, Coordinates } from "./event-publication";

export type PublicationIssue = {
  id: "date" | "end" | "location" | "weather";
  message: string;
  destination: string;
};

// Shared by the setup guide, review form and authoritative publication parser.
// Draft validity (including name and date ordering) is checked before this stage.
export function publicationIssues(snapshot: PublicationSnapshot): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  if (!snapshot.details.startsAtUtc) issues.push({ id: "date", message: "Add the event start date and time.", destination: "#draft-date-heading" });
  if (!snapshot.details.endsAtUtc) issues.push({ id: "end", message: "Add an end time for accurate calendar entries.", destination: "#draft-date-heading" });
  if (!snapshot.details.address.trim()) issues.push({ id: "location", message: "Add the event address.", destination: "#draft-place-heading" });
  if (snapshot.settings.features.weather && !snapshot.coordinates) issues.push({ id: "weather", message: "Confirm the event’s latitude and longitude, or turn Weather off.", destination: "/publish#weather-location" });
  return issues;
}

export function publicationProblems(snapshot: PublicationSnapshot) {
  return publicationIssues(snapshot).map(({ message }) => message);
}

// Never carry weather coordinates over to an edited address without review.
// Only an explicit publication stores confirmed coordinates today.
export function savedWeatherCoordinates(details: EventDraftFields, published: PublicationSnapshot | null): Coordinates | null {
  return published && details.address.trim() === published.details.address.trim() ? published.coordinates : null;
}
