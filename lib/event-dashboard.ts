import type { EventVisibility } from "./event-lifecycle";
import type { EventConfiguration } from "./oyster-roast-event";

// Host-only presentation data. Never includes raw snapshots or guest records.
export type HostEventCard = {
  id: string;
  title: string;
  draftTitle: string | null;
  dateLabel: string;
  cityLabel: string;
  image: { src: string; alt: string } | null;
  status: EventVisibility | "draft";
  rsvpsOpen: boolean;
  hasUnpublishedChanges: boolean;
  setupHref: string;
  editHref: string;
  guestsHref: string | null;
  reviewHref: string;
  shareHref: string | null;
  publicHref: string | null;
  duplicateHref: string;
  legacy?: boolean;
};

export function eventCardDate(startsAtUtc: string | null, timeZone: string) {
  return startsAtUtc ? new Intl.DateTimeFormat("en-US", {
    timeZone, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(startsAtUtc)) : "Date to be decided";
}

export function legacyEventCard(event: EventConfiguration): HostEventCard {
  return {
    id: event.slug, title: event.title, draftTitle: null,
    dateLabel: eventCardDate(event.startsAtUtc, event.timeZone), cityLabel: event.cityLabel,
    image: event.invitation.imageUrl ? { src: event.invitation.imageUrl, alt: event.invitation.imageAlt } : null,
    status: "published", rsvpsOpen: true, hasUnpublishedChanges: false,
    setupHref: "/admin", editHref: "/admin/invitation", guestsHref: "/admin",
    reviewHref: "/admin/invitation", shareHref: null, publicHref: event.websiteUrl,
    duplicateHref: "/admin/events/duplicate/" + event.slug, legacy: true,
  };
}
