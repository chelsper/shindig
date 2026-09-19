import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const GUEST_COOKIE = "shindig_guest_v1";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export function guestTokenHash(raw: unknown): string | null {
  return typeof raw === "string" && TOKEN_PATTERN.test(raw) ? createHash("sha256").update(`shindig-guest-v1:${raw}`).digest("hex") : null;
}

// Anonymous browser marker only, never an account/session or RSVP identity.
// The raw random value stays in an HTTP-only, host-only cookie; Neon gets a hash.
export async function getGuestTokenHash(create = false): Promise<string | null> {
  const jar = await cookies();
  const existing = guestTokenHash(jar.get(GUEST_COOKIE)?.value);
  if (existing || !create) return existing;
  const raw = randomBytes(32).toString("hex");
  jar.set(GUEST_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return guestTokenHash(raw);
}
