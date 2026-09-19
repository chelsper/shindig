import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateRsvpForGuest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/server/rsvps", () => ({
  updateRsvpForGuest: mocks.updateRsvpForGuest,
}));

import { updateRsvp } from "../app/rsvp/actions";

const editToken = "A".repeat(43);
const validUpdate = {
  editToken,
  guestName: "Test Guest",
  attending: true,
  partySize: 3,
  comment: "Updated note",
};

describe("updateRsvp", () => {
  beforeEach(() => {
    mocks.updateRsvpForGuest.mockReset();
  });

  it("returns the database-confirmed updated RSVP", async () => {
    const rsvp = {
      guestName: "Test Guest",
      attending: true,
      partySize: 3,
      comment: "Updated note",
    };
    mocks.updateRsvpForGuest.mockResolvedValue(rsvp);

    await expect(updateRsvp(validUpdate)).resolves.toEqual({ ok: true, rsvp });
    expect(mocks.updateRsvpForGuest).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      {
        guestName: "Test Guest",
        attending: true,
        partySize: 3,
        comment: "Updated note",
      },
    );
  });

  it("stores null party size when changing to declined", async () => {
    const declined = {
      guestName: "Test Guest",
      attending: false,
      partySize: null,
      comment: null,
    };
    mocks.updateRsvpForGuest.mockResolvedValue(declined);

    await expect(
      updateRsvp({ ...validUpdate, attending: false, partySize: 18, comment: null }),
    ).resolves.toEqual({ ok: true, rsvp: declined });
    expect(mocks.updateRsvpForGuest).toHaveBeenCalledWith(
      expect.any(String),
      declined,
    );
  });

  it("rejects attending without a valid party size", async () => {
    await expect(
      updateRsvp({ ...validUpdate, partySize: null }),
    ).resolves.toEqual({
      ok: false,
      message: "Party size must be between 1 and 20.",
    });
    expect(mocks.updateRsvpForGuest).not.toHaveBeenCalled();
  });

  it("does not reveal whether a malformed or unknown token exists", async () => {
    await expect(
      updateRsvp({ ...validUpdate, editToken: "not-a-token" }),
    ).resolves.toEqual({
      ok: false,
      message: "This private update link is no longer available.",
    });

    mocks.updateRsvpForGuest.mockResolvedValue(null);
    await expect(updateRsvp(validUpdate)).resolves.toEqual({
      ok: false,
      message: "This private update link is no longer available.",
    });
  });

  it("returns a retry message rather than false success after database failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.updateRsvpForGuest.mockRejectedValue(new Error("database unavailable"));

    await expect(updateRsvp(validUpdate)).resolves.toEqual({
      ok: false,
      message: "We couldn’t update your RSVP. Please try again in a moment.",
    });
    consoleError.mockRestore();
  });
});
