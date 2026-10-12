import type { EventFeatures } from "./oyster-roast-event";
import type { EventLifecycle } from "./event-lifecycle";
import { rsvpAvailability, type RsvpLimits } from "./rsvp-policy";

export type HostingOverview = {
  checkedAt: number;
  rsvps: { totalAttending: number; totalResponses: number; declined: number; totalPartySize: number } | null;
  potluck: { items: number; needed: number; covered: number; remaining: number; uncoveredItems: number } | null;
  questions: { total: number; unanswered: number; answeredPrivate: number; approved: number } | null;
  playlist: { total: number } | null;
  polls: { total: number; open: number; drafts: number; closed: number } | null;
  updates: { total: number } | null;
};
export type HostingPublication = EventLifecycle & { rsvp: RsvpLimits; features: EventFeatures; timeZone: string };

export function hostingRsvpStatus(publication: HostingPublication | null, rsvps: HostingOverview["rsvps"], now: number) {
  if (!publication) return "Not published yet";
  if (publication.visibility !== "published") return publication.visibility === "archived" ? "Event archived" : "Event unpublished";
  const status = rsvpAvailability(publication.rsvpsOpen, publication.rsvp, rsvps?.totalPartySize ?? 0, now);
  if (status === "closed") return "Guest RSVPs paused";
  if (status === "deadline") return "RSVP deadline passed";
  if (!rsvps && publication.rsvp.capacity != null) return "Capacity check unavailable";
  return status === "full" ? "Guest capacity reached" : "Guest RSVPs open";
}

// Keep saved choices separate from what is currently on the public Hub.
export function hostingSectionStatus(feature: keyof EventFeatures, draft: EventFeatures, publication: HostingPublication | null) {
  const live = publication?.visibility === "published" && publication.features[feature];
  return live ? draft[feature] ? "Live" : "Live · off after publishing" : draft[feature] ? "Saved privately" : "Off · saved activity retained";
}
