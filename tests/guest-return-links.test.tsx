import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RememberGuestLink, SavedGuestLinks } from "../components/guest-return-links";
import { forgetGuestLink, GUEST_LINK_LIFETIME_MS, GUEST_LINKS_STORAGE_KEY, guestReturnPath, MAX_GUEST_LINKS, parseGuestLinks, rememberGuestLink, type GuestReturnLink } from "../lib/guest-return-links";
import { hubSectionPath, hubSectionStorageKey, resolveHubSection } from "../lib/hub-navigation";

const now = Date.now();
const saved: GuestReturnLink = { eventSlug: "event-one", kind: "rsvp", token: "A".repeat(43), savedAt: now };
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

describe("public Hub links", () => {
  const enabled = ["guestList", "potluck", "playlist"] as const;
  it("gives explicit links priority over remembered selection", () => {
    expect(resolveHubSection("#potluck", enabled, "playlist")).toBe("potluck");
    expect(resolveHubSection("", enabled, "playlist")).toBe("playlist");
  });
  it("falls back safely for disabled, malformed and removed sections", () => {
    for (const hash of ["#weather", "#javascript:alert(1)", "#%zz", "#photos"]) expect(resolveHubSection(hash, enabled, "potluck")).toBe("guestList");
    expect(resolveHubSection("", enabled, "weather")).toBe("guestList");
    expect(resolveHubSection("#playlist", [], null)).toBeUndefined();
  });
  it("shares only known public Hub routes, with no query parameters", () => {
    expect(hubSectionPath("/event", "playlist")).toBe("/event#playlist");
    expect(hubSectionPath("/e/backyard-party/event", "potluck")).toBe("/e/backyard-party/event#potluck");
    for (const path of ["//evil.test/event", "/rsvp/private", "/event?token=secret", "/event#weather", "https://evil.test/event"]) expect(() => hubSectionPath(path, "playlist")).toThrow();
    expect(hubSectionStorageKey("one")).not.toBe(hubSectionStorageKey("two"));
  });
});

describe("opt-in private guest shortcuts", () => {
  it("stores only event, kind, token and timestamp and deduplicates repeated saves", () => {
    const local = storage();
    expect(rememberGuestLink(local, { ...saved, guestName: "Private name", comment: "Private note", url: "https://evil.test" } as GuestReturnLink, now)).toBe(true);
    expect(rememberGuestLink(local, saved, now + 1)).toBe(true);
    const raw = local.getItem(GUEST_LINKS_STORAGE_KEY)!;
    expect(JSON.parse(raw)).toEqual([{ ...saved, savedAt: now + 1 }]);
    expect(raw).not.toMatch(/Private|https|guestName|comment/);
  });
  it("preserves independent events and multiple RSVP/signup links", () => {
    const local = storage();
    const second = { ...saved, eventSlug: "event-two" };
    const third = { ...saved, kind: "potluck" as const };
    for (const link of [saved, second, third]) expect(rememberGuestLink(local, link, now)).toBe(true);
    expect(forgetGuestLink(local, saved)).toBe(true);
    expect(parseGuestLinks(local.getItem(GUEST_LINKS_STORAGE_KEY), now)).toEqual([second, third]);
    forgetGuestLink(local, second); forgetGuestLink(local, third);
    expect(local.getItem(GUEST_LINKS_STORAGE_KEY)).toBeNull();
  });
  it("expires shortcuts, strips extras, and tolerates malformed browser data", () => {
    for (const raw of [null, "garbage", "{}", "[null, 1, {}]", "x".repeat(12_001)]) expect(parseGuestLinks(raw, now)).toEqual([]);
    for (const entry of [{ ...saved, token: "guessable" }, { ...saved, eventSlug: "../other" }, { ...saved, kind: "admin" }, { ...saved, savedAt: now + 1 }, { ...saved, savedAt: now - GUEST_LINK_LIFETIME_MS }, { ...saved, savedAt: "today" }, { ...saved, eventSlug: "oyster-roast-2026", kind: "potluck" }]) expect(parseGuestLinks(JSON.stringify([entry]), now)).toEqual([]);
    expect(parseGuestLinks(JSON.stringify([{ ...saved, secret: "not retained" }, saved]), now)).toEqual([saved]);
  });
  it("never silently evicts existing links when full", () => {
    const local = storage();
    for (let i = 0; i < MAX_GUEST_LINKS; i++) expect(rememberGuestLink(local, { ...saved, eventSlug: `event-${i}` }, now)).toBe(true);
    expect(rememberGuestLink(local, saved, now)).toBe(false);
    expect(parseGuestLinks(local.getItem(GUEST_LINKS_STORAGE_KEY), now)).toHaveLength(MAX_GUEST_LINKS);
  });
  it("fails without claiming success when storage access or writes fail", () => {
    const fail = () => { throw new Error("Storage denied"); };
    expect(rememberGuestLink({ getItem: fail, setItem: fail, removeItem: fail }, saved)).toBe(false);
    expect(rememberGuestLink({ getItem: () => null, setItem: fail, removeItem: fail }, saved)).toBe(false);
    expect(forgetGuestLink({ getItem: fail, setItem: fail, removeItem: fail }, saved)).toBe(false);
    expect(rememberGuestLink(storage(), { ...saved, token: "not a token" })).toBe(false);
  });
  it("constructs paths locally from validated tokens and current aliases", () => {
    expect(guestReturnPath(saved, "new-party-name")).toBe(`/e/new-party-name/rsvp/${saved.token}`);
    expect(guestReturnPath({ ...saved, kind: "potluck" }, "new-party-name")).toBe(`/e/new-party-name/bring/${saved.token}`);
    expect(guestReturnPath({ ...saved, eventSlug: "oyster-roast-2026" })).toBe(`/rsvp/${saved.token}`);
    expect(() => guestReturnPath(saved, "//evil.test")).toThrow();
    expect(() => guestReturnPath({ ...saved, token: "../admin" })).toThrow();
  });
  it("never embeds saved guest links into shared server HTML", () => {
    expect(renderToStaticMarkup(<SavedGuestLinks eventSlug={saved.eventSlug} potluckEnabled />)).toBe("");
    const html = renderToStaticMarkup(<RememberGuestLink {...saved} />);
    expect(html).toContain("Remember this private link on this device");
    expect(html).toContain("shared device");
    expect(html).not.toContain(saved.token);
    expect(html).not.toContain("Saved in this browser");
  });
});
