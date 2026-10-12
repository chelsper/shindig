import { eventPaths } from "./event-routes";
import { isValidRsvpEditToken } from "./rsvp-edit-token";

export const GUEST_LINKS_STORAGE_KEY = "shindig:private-links:v1";
export const GUEST_LINK_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_GUEST_LINKS = 20;
export type GuestLinkKind = "rsvp" | "potluck";
export type GuestReturnLink = { eventSlug: string; kind: GuestLinkKind; token: string; savedAt: number };
type LinkIdentity = Omit<GuestReturnLink, "savedAt">;
type LinkStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function validIdentity(link: LinkIdentity) {
  return typeof link.eventSlug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.eventSlug)
    && link.eventSlug.length <= 100 && (link.kind === "rsvp" || link.kind === "potluck")
    && !(link.eventSlug === "oyster-roast-2026" && link.kind === "potluck") && isValidRsvpEditToken(link.token);
}

export function sameGuestLink(a: LinkIdentity, b: LinkIdentity) {
  return a.eventSlug === b.eventSlug && a.kind === b.kind && a.token === b.token;
}

export function parseGuestLinks(raw: string | null, now = Date.now()): GuestReturnLink[] {
  if (!raw || raw.length > 12_000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const links: GuestReturnLink[] = [];
    for (const entry of value.slice(0, MAX_GUEST_LINKS)) {
      if (!entry || typeof entry !== "object" || !validIdentity(entry) || !Number.isSafeInteger(entry.savedAt)
        || entry.savedAt > now || entry.savedAt <= now - GUEST_LINK_LIFETIME_MS) continue;
      // Reconstruct explicitly: never retain names, form data, arbitrary URLs or extra fields.
      const link = { eventSlug: entry.eventSlug, kind: entry.kind, token: entry.token, savedAt: entry.savedAt };
      if (!links.some(saved => sameGuestLink(saved, link))) links.push(link);
    }
    return links;
  } catch { return []; }
}

export function rememberGuestLink(storage: LinkStorage, link: LinkIdentity, now = Date.now()): boolean {
  if (!validIdentity(link)) return false;
  try {
    const links = parseGuestLinks(storage.getItem(GUEST_LINKS_STORAGE_KEY), now).filter(saved => !sameGuestLink(saved, link));
    // Never silently evict another guest's private link on a shared browser.
    if (links.length >= MAX_GUEST_LINKS) return false;
    storage.setItem(GUEST_LINKS_STORAGE_KEY, JSON.stringify([...links, { eventSlug: link.eventSlug, kind: link.kind, token: link.token, savedAt: now }]));
    return true;
  } catch { return false; }
}

export function forgetGuestLink(storage: LinkStorage, link: LinkIdentity): boolean {
  try {
    const links = parseGuestLinks(storage.getItem(GUEST_LINKS_STORAGE_KEY)).filter(saved => !sameGuestLink(saved, link));
    if (links.length) storage.setItem(GUEST_LINKS_STORAGE_KEY, JSON.stringify(links));
    else storage.removeItem(GUEST_LINKS_STORAGE_KEY);
    return true;
  } catch { return false; }
}

export function guestReturnPath(link: LinkIdentity, publicSlug = link.eventSlug) {
  if (!validIdentity(link) || (link.eventSlug === "oyster-roast-2026" && link.kind !== "rsvp")) throw new Error("Invalid private link");
  const prefix = link.eventSlug === "oyster-roast-2026" ? "" : eventPaths(publicSlug).invitation;
  return `${prefix}/${link.kind === "rsvp" ? "rsvp" : "bring"}/${link.token}`;
}
