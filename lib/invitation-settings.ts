import { OYSTER_ROAST_EVENT, type OysterRoastEvent } from "./oyster-roast-event";

export type InvitationSettings = Pick<OysterRoastEvent,
  "title" | "description" | "venue" | "address" | "cityLabel" | "startsAtUtc" | "endsAtUtc" | "coordinates" | "invitation">;

const base = OYSTER_ROAST_EVENT;
export const DEFAULT_INVITATION_SETTINGS: InvitationSettings = {
  title: base.title, description: base.description, venue: base.venue,
  address: base.address, cityLabel: base.cityLabel, startsAtUtc: base.startsAtUtc,
  endsAtUtc: base.endsAtUtc, coordinates: { ...base.coordinates }, invitation: { ...base.invitation },
};

export type InvitationRecord = { settings: InvitationSettings; revision: number };

export function resolveEventConfiguration(settings: InvitationSettings): OysterRoastEvent {
  const date = new Date(settings.startsAtUtc);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", {
    timeZone: base.timeZone, ...options,
  }).format(date);
  return {
    ...base, ...settings,
    dateLabel: format({ weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    shortDateLabel: format({ weekday: "long", month: "long", day: "numeric" }),
    timeLabel: format({ hour: "numeric", minute: "2-digit" }),
  };
}

// datetime-local has no offset. Always interpret it in the event's timezone,
// never in the host's laptop timezone. Reject ambiguous/nonexistent DST times.
export function toEventLocalInput(utc: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: base.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utc));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function fromEventLocalInput(value: unknown): string | null {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime)) return null;
  // New York has UTC-4 / UTC-5 during the supported 2000–2099 date range.
  const matches = [4, 5].map((offset) => new Date(wallTime + offset * 3600000).toISOString())
    .filter((utc) => toEventLocalInput(utc) === value);
  return matches.length === 1 ? matches[0] : null;
}

export function isAllowedInvitationImage(value: string): boolean {
  if (value === base.invitation.imageUrl) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      url.pathname.startsWith(`/invitation/${base.slug}/`) &&
      /\.(png|jpe?g|webp|avif)$/i.test(url.pathname) &&
      !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}

export function validateInvitationSettings(input: unknown):
  { success: true; data: InvitationSettings } | { success: false; message: string } {
  try {
    if (!input || typeof input !== "object") throw new Error("Please check the invitation details.");
    const row = input as Record<string, unknown>;
    const image = row.invitation as Record<string, unknown> | undefined;
    const coords = row.coordinates as Record<string, unknown> | undefined;
    if (!image || !coords) throw new Error("Please check the artwork and location details.");
    function text(value: unknown, label: string, max: number, optional = false) {
      if (typeof value !== "string" || (!optional && !value.trim()) || value.trim().length > max ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        throw new Error(`${label} must be ${optional ? "at most" : "between 1 and"} ${max} characters.`);
      }
      return value.trim();
    }
    function number(value: unknown, label: string, min: number, max: number, integer = false) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new Error(`Please enter a valid ${label}.`);
      }
      return value;
    }
    function timestamp(value: unknown) {
      if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
        throw new Error("Please enter valid event dates and times (2000–2099).");
      }
      return value;
    }
    const startsAtUtc = timestamp(row.startsAtUtc);
    const endsAtUtc = timestamp(row.endsAtUtc);
    const duration = Date.parse(endsAtUtc) - Date.parse(startsAtUtc);
    if (duration <= 0 || duration > 7 * 86400000) throw new Error("The end time must be after the start, within seven days.");
    const imageUrl = text(image.imageUrl, "Artwork URL", 2048);
    if (!isAllowedInvitationImage(imageUrl)) throw new Error("Please upload invitation artwork using this editor.");
    return { success: true, data: {
      title: text(row.title, "Event title", 180), description: text(row.description, "Description", 2000),
      venue: text(row.venue, "Venue", 120), address: text(row.address, "Address", 300),
      cityLabel: text(row.cityLabel, "City label", 100), startsAtUtc, endsAtUtc,
      coordinates: { latitude: number(coords.latitude, "latitude", -90, 90), longitude: number(coords.longitude, "longitude", -180, 180) },
      invitation: {
        eyebrow: text(image.eyebrow, "Invitation label", 60), timeNote: text(image.timeNote, "Time note", 120, true),
        rsvpHeading: text(image.rsvpHeading, "RSVP heading", 120), imageUrl,
        imageAlt: text(image.imageAlt, "Artwork description", 180),
        imageWidth: number(image.imageWidth, "image width", 1, 12000, true),
        imageHeight: number(image.imageHeight, "image height", 1, 12000, true),
      },
    } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Please check the invitation details." };
  }
}
