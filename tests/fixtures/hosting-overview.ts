import type { HostingOverview, HostingPublication } from "../../lib/hosting-overview";
import { publication } from "./publication";
export const hosting: HostingOverview = {
  checkedAt: Date.parse("2026-10-12T16:00:00Z"),
  rsvps: { totalAttending: 8, totalResponses: 10, declined: 2, totalPartySize: 24 },
  potluck: { items: 3, needed: 10, covered: 7, remaining: 3, uncoveredItems: 2 },
  questions: { total: 4, unanswered: 2, answeredPrivate: 1, approved: 1 },
  playlist: { total: 6 }, polls: { total: 3, open: 1, drafts: 1, closed: 1 }, updates: { total: 2 },
};
export const hostingPublication: HostingPublication = {
  visibility: "published", rsvpsOpen: true, timeZone: "America/New_York",
  rsvp: { capacity: 30, deadlineAtUtc: "2026-11-07T22:00:00.000Z" },
  features: { ...publication.snapshot.settings.features, potluck: true },
};
