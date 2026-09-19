import "server-only";

import { createHash } from "node:crypto";

import { isValidRsvpEditToken } from "../rsvp-edit-token";

export function hashRsvpEditToken(token: string) {
  if (!isValidRsvpEditToken(token)) {
    throw new Error("Invalid RSVP edit token.");
  }

  return createHash("sha256").update(token).digest("hex");
}
