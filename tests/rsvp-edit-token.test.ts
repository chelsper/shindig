import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createRsvpEditToken,
  isValidRsvpEditToken,
} from "../lib/rsvp-edit-token";
import { hashRsvpEditToken } from "../lib/server/rsvp-edit-token";

describe("RSVP edit tokens", () => {
  it("creates unique 256-bit base64url bearer tokens", () => {
    const first = createRsvpEditToken();
    const second = createRsvpEditToken();

    expect(first).toHaveLength(43);
    expect(isValidRsvpEditToken(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("stores a one-way hash rather than the raw token", () => {
    const token = createRsvpEditToken();
    const hash = hashRsvpEditToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });

  it.each(["", "short", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}!`])(
    "rejects malformed token %s",
    (token) => {
      expect(isValidRsvpEditToken(token)).toBe(false);
    },
  );
});
