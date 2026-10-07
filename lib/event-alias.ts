// These names and the event-* namespace are reserved in migration 017 too.
export const RESERVED_EVENT_ALIASES = ["admin", "api", "event", "events", "rsvp", "calendar", "new", "edit", "preview", "publish", "settings", "artwork", "share", "qr", "invitation", "login", "logout", "support", "help", "privacy", "terms", "shindig", "jaspershucks", "jasper-shucks", "oyster-roast", "oyster-roast-2026"] as const;
export const EVENT_ALIAS_MAX_LENGTH = 60;

export function validateEventAlias(input: unknown): { ok: true; alias: string | null } | { ok: false; message: string } {
  if (input === null || input === undefined || input === "") return { ok: true, alias: null };
  if (typeof input !== "string") return { ok: false, message: "Please enter a valid event link." };
  const alias = input.trim().toLowerCase();
  if (!alias) return { ok: true, alias: null };
  if (alias.length < 3 || alias.length > EVENT_ALIAS_MAX_LENGTH || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias)) return { ok: false, message: "Use 3–60 letters or numbers, with single hyphens between words." };
  if (alias.startsWith("event-") || RESERVED_EVENT_ALIASES.some((name) => name === alias)) return { ok: false, message: "That link is reserved. Choose another name for your gathering." };
  return { ok: true, alias };
}

export function isEventAlias(value: unknown): value is string {
  const result = validateEventAlias(value);
  return typeof value === "string" && result.ok && result.alias !== null && result.alias === value;
}

export function suggestEventAlias(title: string) {
  const suggestion = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, EVENT_ALIAS_MAX_LENGTH).replace(/-$/, "");
  return isEventAlias(suggestion) ? suggestion : "";
}

// Only these deliberately public messages may cross the server-action boundary.
export class EventAliasError extends Error {}
