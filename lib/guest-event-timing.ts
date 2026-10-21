import type { EventConfiguration } from "./oyster-roast-event";
import { DAY_MS, localDate } from "./weather";

export type GuestEventTiming = { nearEvent: boolean; label: string | null };

// Presentation only: this never changes RSVP availability or implies a forecast
// exists. Resolve once on the server so the initial guest UI hydrates consistently.
export function guestEventTiming(event: Pick<EventConfiguration, "startsAtUtc" | "endsAtUtc" | "timeZone">, now = Date.now()): GuestEventTiming {
  const start = Date.parse(event.startsAtUtc), end = Date.parse(event.endsAtUtc);
  const ordinary = { nearEvent: false, label: null };
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || now >= end) return ordinary;
  try {
    const days = Math.round((Date.parse(localDate(start, event.timeZone)) - Date.parse(localDate(now, event.timeZone))) / DAY_MS);
    if (now >= start) return { nearEvent: true, label: "Happening now" };
    if (days === 0) return { nearEvent: true, label: "Today’s the day" };
    if (days === 1) return { nearEvent: true, label: "See you tomorrow" };
    if (days >= 2 && days <= 7) return { nearEvent: true, label: "Coming up soon" };
    return ordinary;
  } catch { return ordinary; }
}
