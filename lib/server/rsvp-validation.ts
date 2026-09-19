import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";

export const OYSTER_ROAST_EVENT_SLUG = OYSTER_ROAST_EVENT.slug;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_GUEST_NAME_LENGTH = 120;
const MAX_COMMENT_LENGTH = 1_000;
const MAX_PARTY_SIZE = 20;

export type ValidatedRsvp = {
  id: string;
  eventSlug: typeof OYSTER_ROAST_EVENT_SLUG;
  guestName: string;
  attending: boolean;
  partySize: number | null;
  displayOnGuestList: boolean;
  comment: string | null;
};

export type ValidatedRsvpUpdate = {
  guestName: string;
  attending: boolean;
  partySize: number | null;
  displayOnGuestList: boolean;
  comment: string | null;
};

type SubmissionValidationResult =
  | { success: true; data: ValidatedRsvp }
  | { success: false; message: string };

type UpdateValidationResult =
  | { success: true; data: ValidatedRsvpUpdate }
  | { success: false; message: string };

function validateRsvpFields(
  submission: Record<string, unknown>,
): UpdateValidationResult {
  if (typeof submission.guestName !== "string") {
    return { success: false, message: "Please enter your name." };
  }

  const guestName = submission.guestName.trim();
  if (!guestName) {
    return { success: false, message: "Please enter your name." };
  }

  if (guestName.length > MAX_GUEST_NAME_LENGTH) {
    return { success: false, message: "Please use a shorter name." };
  }

  if (typeof submission.attending !== "boolean") {
    return { success: false, message: "Please choose an RSVP response." };
  }

  let partySize: number | null = null;
  let displayOnGuestList = false;
  if (submission.attending) {
    if (
      typeof submission.partySize !== "number" ||
      !Number.isInteger(submission.partySize) ||
      submission.partySize < 1 ||
      submission.partySize > MAX_PARTY_SIZE
    ) {
      return {
        success: false,
        message: `Party size must be between 1 and ${MAX_PARTY_SIZE}.`,
      };
    }

    partySize = submission.partySize;

    if (typeof submission.displayOnGuestList !== "boolean") {
      return {
        success: false,
        message: "Please check your guest list preference and try again.",
      };
    }

    displayOnGuestList = submission.displayOnGuestList;
  }

  if (
    submission.comment !== undefined &&
    submission.comment !== null &&
    typeof submission.comment !== "string"
  ) {
    return { success: false, message: "Please check your response and try again." };
  }

  const comment =
    typeof submission.comment === "string" ? submission.comment.trim() || null : null;

  if (comment && comment.length > MAX_COMMENT_LENGTH) {
    return { success: false, message: "Please keep your note under 1,000 characters." };
  }

  return {
    success: true,
    data: {
      guestName,
      attending: submission.attending,
      partySize,
      displayOnGuestList,
      comment,
    },
  };
}

export function validateRsvpUpdate(input: unknown): UpdateValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Please check your response and try again." };
  }

  return validateRsvpFields(input as Record<string, unknown>);
}

export function validateRsvpSubmission(
  input: unknown,
): SubmissionValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Please check your response and try again." };
  }

  const submission = input as Record<string, unknown>;

  if (
    typeof submission.submissionId !== "string" ||
    !UUID_V4_PATTERN.test(submission.submissionId)
  ) {
    return { success: false, message: "Please refresh the page and try again." };
  }

  if (submission.eventSlug !== OYSTER_ROAST_EVENT_SLUG) {
    return { success: false, message: "This invitation is no longer available." };
  }

  const fields = validateRsvpFields(submission);

  if (!fields.success) return fields;

  return {
    success: true,
    data: {
      id: submission.submissionId,
      eventSlug: OYSTER_ROAST_EVENT_SLUG,
      ...fields.data,
    },
  };
}
