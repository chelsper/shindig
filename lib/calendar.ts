import {
  OYSTER_ROAST_EVENT,
  type OysterRoastEvent,
} from "./oyster-roast-event";

function formatUtcTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Calendar timestamp is invalid.");
  }

  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatIsoTimestamp(value: string) {
  return new Date(value).toISOString().replace(".000Z", "Z");
}

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function getCalendarDescription(
  event: OysterRoastEvent,
  rsvpUrl?: string,
) {
  const links = [`View Event Hub: ${getEventHubUrl(event)}`];
  if (rsvpUrl) links.push(`Update your RSVP (private link): ${rsvpUrl}`);

  return `${event.description}\n\n${links.join("\n\n")}`;
}

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";

  for (const character of line) {
    if (encoder.encode(current + character).length > 75) {
      folded.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }

  folded.push(current);
  return folded.join("\r\n");
}

export function getEventHubUrl(event: OysterRoastEvent = OYSTER_ROAST_EVENT) {
  return new URL(event.eventHub.path, event.websiteUrl).toString();
}

export function getRsvpUpdateUrl(
  editToken: string,
  event: OysterRoastEvent = OYSTER_ROAST_EVENT,
) {
  return new URL(`/rsvp/${encodeURIComponent(editToken)}`, event.websiteUrl).toString();
}

export function createOysterRoastIcs(
  generatedAt = new Date(),
  rsvpUrl?: string,
) {
  const event = OYSTER_ROAST_EVENT;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shindig//Annualish Oyster Roast 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.calendarUid}`,
    `DTSTAMP:${formatUtcTimestamp(generatedAt)}`,
    `DTSTART:${formatUtcTimestamp(event.startsAtUtc)}`,
    `DTEND:${formatUtcTimestamp(event.endsAtUtc)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(getCalendarDescription(event, rsvpUrl))}`,
    `LOCATION:${escapeIcsText(event.address)}`,
    `URL:${getEventHubUrl(event)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function getGoogleCalendarUrl(
  rsvpUrl?: string,
  event: OysterRoastEvent = OYSTER_ROAST_EVENT,
) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set(
    "dates",
    `${formatUtcTimestamp(event.startsAtUtc)}/${formatUtcTimestamp(event.endsAtUtc)}`,
  );
  url.searchParams.set("details", getCalendarDescription(event, rsvpUrl));
  url.searchParams.set("location", event.address);

  return url.toString();
}

export function getOutlookCalendarUrl(
  rsvpUrl?: string,
  event: OysterRoastEvent = OYSTER_ROAST_EVENT,
) {
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  url.searchParams.set("path", "/calendar/action/compose");
  url.searchParams.set("rru", "addevent");
  url.searchParams.set("allday", "false");
  url.searchParams.set("subject", event.title);
  url.searchParams.set("startdt", formatIsoTimestamp(event.startsAtUtc));
  url.searchParams.set("enddt", formatIsoTimestamp(event.endsAtUtc));
  url.searchParams.set("body", getCalendarDescription(event, rsvpUrl));
  url.searchParams.set("location", event.address);

  return url.toString();
}
