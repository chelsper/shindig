import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));

import {
  getRsvpForGuest,
  getRsvpSummary,
  listRsvps,
  saveRsvp,
  updateRsvpForGuest,
  getPublicGuestList,
} from "../lib/server/rsvps";

const rsvp = {
  id: "4f849d18-931b-42ef-a4d4-7ec07aa73b3d",
  eventSlug: "oyster-roast-2026" as const,
  guestName: "Test Guest",
  attending: true,
  partySize: 4,
  displayOnGuestList: true,
  comment: "Save me a seat",
};

const savedRsvp = {
  id: rsvp.id,
  guestName: rsvp.guestName,
  attending: true,
  partySize: 4,
  displayOnGuestList: true,
  comment: rsvp.comment,
};
const editTokenHash = "f".repeat(64);

describe("saveRsvp", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
    mocks.neon.mockReset();
    mocks.sql.mockReset();
    mocks.neon.mockReturnValue(mocks.sql);
  });

  it("inserts and returns the database-confirmed RSVP", async () => {
    mocks.sql.mockResolvedValueOnce([{ ...savedRsvp, editTokenHash }]);

    await expect(saveRsvp(rsvp, editTokenHash)).resolves.toEqual({
      status: "created",
      rsvp: savedRsvp,
    });

    const [queryParts, ...values] = mocks.sql.mock.calls[0];
    expect(queryParts.join("?")).toContain("ON CONFLICT (id) DO NOTHING");
    expect(values).toEqual([
      rsvp.id,
      rsvp.eventSlug,
      rsvp.guestName,
      rsvp.attending,
      rsvp.partySize,
      rsvp.displayOnGuestList,
      rsvp.comment,
      editTokenHash,
    ]);
  });

  it("reads back the existing row after a duplicate submission", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...savedRsvp, editTokenHash }]);

    await expect(saveRsvp(rsvp, editTokenHash)).resolves.toEqual({
      status: "duplicate",
      rsvp: savedRsvp,
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it("reports disabled persistence when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(saveRsvp(rsvp, editTokenHash)).resolves.toEqual({ status: "disabled" });
    expect(mocks.neon).not.toHaveBeenCalled();
  });

  it("does not authorize a duplicate submission with a different edit token", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...savedRsvp, editTokenHash }]);

    await expect(saveRsvp(rsvp, "a".repeat(64))).rejects.toThrow(
      "The saved RSVP could not be confirmed.",
    );
  });
});

describe("guest RSVP access", () => {
  const guestRsvp = {
    guestName: "Test Guest",
    attending: true,
    partySize: 4,
    displayOnGuestList: true,
    comment: "Save me a seat",
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
    mocks.neon.mockReset();
    mocks.sql.mockReset();
    mocks.neon.mockReturnValue(mocks.sql);
  });

  it("loads only the RSVP matching the event and token hash", async () => {
    mocks.sql.mockResolvedValueOnce([guestRsvp]);

    await expect(getRsvpForGuest(editTokenHash)).resolves.toEqual(guestRsvp);

    const [queryParts, ...values] = mocks.sql.mock.calls[0];
    expect(queryParts.join("?")).toContain("edit_token_hash =");
    expect(queryParts.join("?")).toContain("LIMIT 1");
    expect(values).toEqual(["oyster-roast-2026", editTokenHash]);
  });

  it("updates the matching RSVP and refreshes updated_at", async () => {
    const declinedRsvp = {
      guestName: "Test Guest",
      attending: false,
      partySize: null,
      displayOnGuestList: false,
      comment: null,
    };
    mocks.sql.mockResolvedValueOnce([declinedRsvp]);

    await expect(
      updateRsvpForGuest(editTokenHash, declinedRsvp),
    ).resolves.toEqual(declinedRsvp);

    const [queryParts, ...values] = mocks.sql.mock.calls[0];
    expect(queryParts.join("?")).toContain("updated_at = now()");
    expect(queryParts.join("?")).toContain("edit_token_hash =");
    expect(values).toEqual([
      declinedRsvp.guestName,
      false,
      null,
      false,
      null,
      "oyster-roast-2026",
      editTokenHash,
    ]);
  });

  it("returns null for an unknown guest token", async () => {
    mocks.sql.mockResolvedValueOnce([]);

    await expect(getRsvpForGuest(editTokenHash)).resolves.toBeNull();
  });
});

describe("public guest list query", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
    mocks.neon.mockReset();
    mocks.sql.mockReset();
    mocks.neon.mockReturnValue(mocks.sql);
  });

  it("counts every attendee but returns names only for visible attending RSVPs", async () => {
    mocks.sql
      .mockResolvedValueOnce([{ totalGuestCount: "6" }])
      .mockResolvedValueOnce([{ guestName: "Visible Household", partySize: "2" }]);

    await expect(getPublicGuestList()).resolves.toEqual({
      totalGuestCount: 6,
      guests: [{ guestName: "Visible Household", partySize: 2 }],
    });

    expect(mocks.sql).toHaveBeenCalledTimes(2);
    const totalQuery = mocks.sql.mock.calls[0][0].join("?");
    const visibleQuery = mocks.sql.mock.calls[1][0].join("?");

    expect(totalQuery).toContain("AND attending = true");
    expect(totalQuery).not.toContain("display_on_guest_list = true");
    expect(visibleQuery).toContain("AND attending = true");
    expect(visibleQuery).toContain("AND display_on_guest_list = true");
    expect(visibleQuery).not.toMatch(/\b(comment|edit_token_hash|updated_at|id::text)\b/);
  });
});

describe("admin RSVP queries", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
    mocks.neon.mockReset();
    mocks.sql.mockReset();
    mocks.neon.mockReturnValue(mocks.sql);
  });

  it("returns numeric summary totals for the known event", async () => {
    mocks.sql.mockResolvedValueOnce([
      {
        totalAttending: "3",
        totalResponses: "5",
        declined: "2",
        totalPartySize: "8",
      },
    ]);

    await expect(getRsvpSummary()).resolves.toEqual({
      totalAttending: 3,
      totalResponses: 5,
      declined: 2,
      totalPartySize: 8,
    });

    const [queryParts, ...values] = mocks.sql.mock.calls[0];
    expect(queryParts.join("?")).toContain("FILTER (WHERE attending)");
    expect(values).toEqual(["oyster-roast-2026"]);
  });

  it("lists attending RSVPs newest first", async () => {
    const createdAt = "2026-09-19T14:00:00.000Z";
    const updatedAt = "2026-09-19T14:05:00.000Z";
    mocks.sql.mockResolvedValueOnce([
      {
        ...savedRsvp,
        eventSlug: "oyster-roast-2026",
        createdAt,
        updatedAt,
      },
    ]);

    await expect(listRsvps("attending")).resolves.toEqual([
      {
        ...savedRsvp,
        eventSlug: "oyster-roast-2026",
        createdAt,
        updatedAt,
      },
    ]);

    const [queryParts, ...values] = mocks.sql.mock.calls[0];
    expect(queryParts.join("?")).toContain("ORDER BY created_at DESC");
    expect(values).toEqual(["oyster-roast-2026", true, true]);
  });

  it("fails closed when the admin database connection is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(listRsvps()).rejects.toThrow("Database access is not configured.");
    expect(mocks.neon).not.toHaveBeenCalled();
  });
});
