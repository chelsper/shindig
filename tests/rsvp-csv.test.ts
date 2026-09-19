import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rsvpsToCsv } from "../lib/server/rsvp-csv";
import type { AdminRsvp } from "../lib/server/rsvps";

describe("RSVP CSV export", () => {
  it("uses the required columns and safely escapes guest content", () => {
    const rows: AdminRsvp[] = [
      {
        id: "4f849d18-931b-42ef-a4d4-7ec07aa73b3d",
        eventSlug: "oyster-roast-2026",
        guestName: 'O\'Brien, "Sam"',
        attending: true,
        partySize: 3,
        displayOnGuestList: true,
        comment: "Looking forward to it!\nNo shellfish for one guest.",
        createdAt: "2026-09-19T14:00:00.000Z",
        updatedAt: "2026-09-19T14:05:00.000Z",
      },
      {
        id: "5a849d18-931b-42ef-a4d4-7ec07aa73b3d",
        eventSlug: "oyster-roast-2026",
        guestName: "=IMPORTDATA(\"https://example.test\")",
        attending: false,
        partySize: null,
        displayOnGuestList: false,
        comment: null,
        createdAt: "2026-09-19T15:00:00.000Z",
        updatedAt: "2026-09-19T15:00:00.000Z",
      },
    ];

    const csv = rsvpsToCsv(rows);

    expect(csv.split("\r\n", 1)[0]).toBe(
      "guest_name,attending,party_size,comment,created_at,updated_at",
    );
    expect(csv).toContain('"O\'Brien, ""Sam"""');
    expect(csv).toContain('"Looking forward to it!\nNo shellfish for one guest."');
    expect(csv).toContain(
      `"'=IMPORTDATA(""https://example.test"")",false,,,2026-09-19T15:00:00.000Z`,
    );
  });
});
