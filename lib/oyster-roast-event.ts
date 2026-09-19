export type EventFeatures = {
  guestList: boolean;
  playlist: boolean;
  weather: boolean;
  photos: boolean;
  questions: boolean;
  updates: boolean;
  potluck: boolean;
  polls: boolean;
};

const features: EventFeatures = {
  guestList: true,
  playlist: true,
  weather: true,
  photos: false,
  questions: true,
  updates: true,
  potluck: false,
  polls: true,
};

export const OYSTER_ROAST_EVENT = {
  slug: "oyster-roast-2026",
  title: "Another Annualish Oyster Roast",
  hostTitle: "Oyster Roast 2026",
  description: "Oysters on the fire, cold drinks in hand, and good food to go around. Come casual and stay awhile.",
  venue: "The backyard",
  address: "172 Belmont Dr, St. Johns, FL 32259",
  cityLabel: "St. Johns, Florida",
  // One-time US Census address match; never geocode visitors or their devices.
  coordinates: { latitude: 30.0287, longitude: -81.6003 },
  dateLabel: "Saturday, November 7, 2026",
  shortDateLabel: "Saturday, November 7",
  timeLabel: "5:00 PM",
  timeZone: "America/New_York",
  startsAtUtc: "2026-11-07T22:00:00.000Z",
  endsAtUtc: "2026-11-08T02:00:00.000Z",
  invitation: {
    eyebrow: "You’re invited",
    timeNote: "until the shells run out",
    rsvpHeading: "Will you join us?",
    imageUrl: "/oyster-roast-invitation.png",
    imageAlt: "Illustrated invitation for Another Annualish Oyster Roast, featuring oysters, seafood platters, and blue stripes",
    imageWidth: 1429,
    imageHeight: 2000,
  },
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

// Identity, feature flags and routes stay fixed; hosts can edit presentation/details.
type EditableText = "title" | "description" | "venue" | "address" | "cityLabel" |
  "dateLabel" | "shortDateLabel" | "timeLabel" | "startsAtUtc" | "endsAtUtc";
export type OysterRoastEvent = Omit<typeof OYSTER_ROAST_EVENT, EditableText | "coordinates" | "invitation"> &
  Record<EditableText, string> & {
    coordinates: { latitude: number; longitude: number };
    invitation: {
      eyebrow: string; timeNote: string; rsvpHeading: string;
      imageUrl: string; imageAlt: string; imageWidth: number; imageHeight: number;
    };
  };

export function eventMonthLabel(event: OysterRoastEvent = OYSTER_ROAST_EVENT) {
  return new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone, month: "long", year: "2-digit" })
    .format(new Date(event.startsAtUtc)).replace(/ (\d{2})$/, " ’$1");
}
