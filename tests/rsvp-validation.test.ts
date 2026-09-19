import { describe, expect, it } from "vitest";

import {
  OYSTER_ROAST_EVENT_SLUG,
  validateRsvpSubmission,
} from "../lib/server/rsvp-validation";

const validSubmission = {
  submissionId: "4f849d18-931b-42ef-a4d4-7ec07aa73b3d",
  eventSlug: OYSTER_ROAST_EVENT_SLUG,
  guestName: "  Test Guest  ",
  attending: true,
  partySize: 4,
  comment: "  Save me a seat  ",
};

describe("validateRsvpSubmission", () => {
  it("normalizes a valid attending RSVP", () => {
    const result = validateRsvpSubmission(validSubmission);

    expect(result).toEqual({
      success: true,
      data: {
        id: validSubmission.submissionId,
        eventSlug: OYSTER_ROAST_EVENT_SLUG,
        guestName: "Test Guest",
        attending: true,
        partySize: 4,
        comment: "Save me a seat",
      },
    });
  });

  it("forces party size to null for a declined RSVP", () => {
    const result = validateRsvpSubmission({
      ...validSubmission,
      attending: false,
      partySize: 12,
      comment: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.partySize).toBeNull();
      expect(result.data.comment).toBeNull();
    }
  });

  it("rejects a missing guest name", () => {
    const result = validateRsvpSubmission({
      ...validSubmission,
      guestName: "   ",
    });

    expect(result).toEqual({ success: false, message: "Please enter your name." });
  });

  it.each([null, 0, 21, 1.5, "4"])(
    "rejects invalid attending party size %s",
    (partySize) => {
      const result = validateRsvpSubmission({ ...validSubmission, partySize });

      expect(result).toEqual({
        success: false,
        message: "Party size must be between 1 and 20.",
      });
    },
  );

  it("rejects an arbitrary event slug", () => {
    const result = validateRsvpSubmission({
      ...validSubmission,
      eventSlug: "another-event",
    });

    expect(result).toEqual({
      success: false,
      message: "This invitation is no longer available.",
    });
  });
});
