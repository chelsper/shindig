import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveRsvp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/server/rsvps", () => ({
  saveRsvp: mocks.saveRsvp,
}));

import { submitRsvp } from "../app/actions";

const validSubmission = {
  submissionId: "4f849d18-931b-42ef-a4d4-7ec07aa73b3d",
  editToken: "A".repeat(43),
  eventSlug: "oyster-roast-2026",
  guestName: "Test Guest",
  attending: true,
  partySize: 4,
  displayOnGuestList: true,
  comment: "Save me a seat",
};

const savedRsvp = {
  id: validSubmission.submissionId,
  guestName: validSubmission.guestName,
  attending: true,
  partySize: 4,
  displayOnGuestList: true,
  comment: validSubmission.comment,
};

describe("submitRsvp", () => {
  beforeEach(() => {
    mocks.saveRsvp.mockReset();
  });

  it("returns the database-confirmed RSVP after a successful insert", async () => {
    mocks.saveRsvp.mockResolvedValue({ status: "created", rsvp: savedRsvp });

    await expect(submitRsvp(validSubmission)).resolves.toEqual({
      ok: true,
      persisted: true,
      rsvp: savedRsvp,
      editToken: validSubmission.editToken,
    });
    expect(mocks.saveRsvp).toHaveBeenCalledWith(
      expect.objectContaining({ id: validSubmission.submissionId }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(mocks.saveRsvp.mock.calls[0][1]).not.toBe(validSubmission.editToken);
  });

  it("treats a confirmed idempotent retry as success", async () => {
    mocks.saveRsvp.mockResolvedValue({ status: "duplicate", rsvp: savedRsvp });

    await expect(submitRsvp(validSubmission)).resolves.toEqual({
      ok: true,
      persisted: true,
      rsvp: savedRsvp,
      editToken: validSubmission.editToken,
    });
  });

  it("rejects invalid input before calling the database", async () => {
    const result = await submitRsvp({ ...validSubmission, guestName: "" });

    expect(result).toEqual({ ok: false, message: "Please enter your name." });
    expect(mocks.saveRsvp).not.toHaveBeenCalled();
  });

  it("rejects an invalid edit token before calling the database", async () => {
    const result = await submitRsvp({ ...validSubmission, editToken: "guessable" });

    expect(result).toEqual({
      ok: false,
      message: "Please refresh the page and try again.",
    });
    expect(mocks.saveRsvp).not.toHaveBeenCalled();
  });

  it("returns a retry message instead of success after a database failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.saveRsvp.mockRejectedValue(new Error("database unavailable"));

    const result = await submitRsvp(validSubmission);

    expect(result).toEqual({
      ok: false,
      message: "We couldn’t save your RSVP. Please try again in a moment.",
    });
    consoleError.mockRestore();
  });

  it("does not report production success when persistence is disabled", async () => {
    mocks.saveRsvp.mockResolvedValue({ status: "disabled" });

    const result = await submitRsvp(validSubmission);

    expect(result).toEqual({
      ok: false,
      message: "RSVPs are temporarily unavailable. Please try again later.",
    });
  });
});
