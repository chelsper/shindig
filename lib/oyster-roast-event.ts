export type EventFeatures = {
  guestList: boolean;
  playlist: boolean;
  weather: boolean;
  photos: boolean;
  questions: boolean;
  updates: boolean;
  potluck: boolean;
};

const features: EventFeatures = {
  guestList: true,
  playlist: true,
  weather: true,
  photos: false,
  questions: true,
  updates: true,
  potluck: false,
};

export const OYSTER_ROAST_EVENT = {
  slug: "oyster-roast-2026",
  title: "Another Annualish Oyster Roast",
  hostTitle: "Oyster Roast 2026",
  description: "Oysters, good food, and a shucking good time.",
  venue: "The backyard",
  address: "172 Belmont Dr, St. Johns, FL 32259",
  cityLabel: "St. Johns, Florida",
  dateLabel: "Saturday, November 7, 2026",
  shortDateLabel: "Saturday, November 7",
  timeLabel: "5:00 PM",
  timeZone: "America/New_York",
  startsAtUtc: "2026-11-07T22:00:00.000Z",
  endsAtUtc: "2026-11-08T02:00:00.000Z",
  calendarUid: "oyster-roast-2026@haveashindig.com",
  calendarFilename: "annualish-oyster-roast.ics",
  websiteUrl: "https://www.haveashindig.com/",
  eventHub: {
    path: "/event",
    headerImage: {
      url: "/oyster-roast-invitation.png",
      alt: "Illustrated oyster roast invitation with seafood platters and blue stripes",
      focalX: 50,
      focalY: 26,
      zoomPercent: 100,
    },
  },
  features,
} as const;

export type OysterRoastEvent = typeof OYSTER_ROAST_EVENT;
