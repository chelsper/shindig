import "server-only";

import type { AdminRsvp } from "./rsvps";

const CSV_COLUMNS = [
  "guest_name",
  "attending",
  "party_size",
  "comment",
  "created_at",
  "updated_at",
] as const;

function escapeCsvValue(value: string | number | boolean | null) {
  if (value === null) {
    return "";
  }

  const rawText = String(value);
  const text = /^[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function rsvpsToCsv(rsvps: AdminRsvp[]) {
  const rows = rsvps.map((rsvp) =>
    [
      rsvp.guestName,
      rsvp.attending,
      rsvp.partySize,
      rsvp.comment,
      rsvp.createdAt,
      rsvp.updatedAt,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [CSV_COLUMNS.join(","), ...rows].join("\r\n");
}
