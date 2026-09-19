import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));

import {
  getRsvpSummary,
  listRsvps,
  saveRsvp,
} from "../lib/server/rsvps";

const rsvp = {
  id: "4f849d18-931b-42ef-a4d4-7ec07aa73b3d",
  eventSlug: "oyster-roast-2026" as const,
  guestName: "Test Guest",
  attending: true,
  partySize: 4,
  comment: "Save me a seat",
};

const savedRsvp = {
  id: rsvp.id,
  guestName: rsvp.guestName,
  attending: true,
  partySize: 4,
  comment: rsvp.comment,
};

describe("saveRsvp", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
    mocks.neon.mockReset();
    mocks.sql.mockReset();
    mocks.neon.mockReturnValue(mocks.sql);
  });

  it("inserts and returns the database-confirmed RSVP", async () => {
    mocks.sql.mockResolvedValueOnce([savedRsvp]);

    await expect(saveRsvp(rsvp)).resolves.toEqual({
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
      rsvp.comment,
    ]);
  });

  it("reads back the existing row after a duplicate submission", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([savedRsvp]);

    await expect(saveRsvp(rsvp)).resolves.toEqual({
      status: "duplicate",
      rsvp: savedRsvp,
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });

  it("reports disabled persistence when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(saveRsvp(rsvp)).resolves.toEqual({ status: "disabled" });
    expect(mocks.neon).not.toHaveBeenCalled();
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
