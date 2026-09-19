const RSVP_EDIT_TOKEN_BYTES = 32;
const RSVP_EDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidRsvpEditToken(token: unknown): token is string {
  return typeof token === "string" && RSVP_EDIT_TOKEN_PATTERN.test(token);
}

export function createRsvpEditToken() {
  const bytes = new Uint8Array(RSVP_EDIT_TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
