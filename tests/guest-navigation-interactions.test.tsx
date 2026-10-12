import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], subscriptions: [] as (() => void)[] }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state<T>(initial: T) { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i] as T, (value: T) => { h.slots[i] = value; }] as const; }
  return { ...react, useState: state, useRef: <T,>(initial: T) => state({ current: initial })[0],
    useCallback: <T,>(callback: T) => callback, useEffect: (effect: () => void) => { h.effects.push(effect); },
    useSyncExternalStore: (subscribe: (callback: () => void) => () => void, snapshot: () => unknown) => { h.subscriptions.push(subscribe(() => {})); return snapshot(); } };
});
import { HubNavigation, type HubModule } from "../components/event-hub/hub-navigation";
import { RememberGuestLink, SavedGuestLinks } from "../components/guest-return-links";
import { GUEST_LINKS_STORAGE_KEY, rememberGuestLink } from "../lib/guest-return-links";
import { hubSectionStorageKey } from "../lib/hub-navigation";

function memory() { const data = new Map<string, string>(); return { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }), removeItem: vi.fn((key: string) => { data.delete(key); }) }; }
let local: ReturnType<typeof memory>, session: ReturnType<typeof memory>, current: URL;
let tree: ReactNode, historyEntries: string[], index: number;
const navigation = { eventSlug: "event-test", hubPath: "/e/test/event" };
const modules: HubModule[] = [
  { id: "guestList", label: "Who’s Coming", icon: "guests", content: <p>Guests</p> },
  { id: "potluck", label: "Bring something", icon: "potluck", content: <input aria-label="Unsubmitted name" /> },
  { id: "playlist", label: "Playlist", icon: "playlist", content: <p>Songs</p> },
];
const identity = { eventSlug: navigation.eventSlug, kind: "rsvp" as const, token: "B".repeat(43) };
function render(component: () => ReactNode) { h.cursor = 0; tree = component(); const effects = h.effects.splice(0); effects.forEach(effect => effect()); }
function find(predicate: (node: ReactElement<Record<string, unknown>>) => boolean, value: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) { for (const child of value) { const found = find(predicate, child ?? null); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, (value.props.children as ReactNode) ?? null);
}
function button(label: string) { return find(n => n.type === "button" && (n.props.children === label || (Array.isArray(n.props.children) && n.props.children.includes(label))))!; }
function click(label: string) { return (button(label).props.onClick as () => void | Promise<void>)(); }
const hub = () => HubNavigation({ modules, navigation });
const remember = () => RememberGuestLink(identity);
const saved = () => SavedGuestLinks({ eventSlug: identity.eventSlug, publicSlug: "test", potluckEnabled: true });
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.effects = []; local = memory(); session = memory();
  current = new URL("https://shindig.test/e/test/event?from=invitation"); historyEntries = [current.href]; index = 0;
  const events = new EventTarget();
  vi.stubGlobal("window", { get location() { return current; }, localStorage: local, sessionStorage: session,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events), setInterval: () => 1, clearInterval() {},
    history: { state: { nextInternal: "preserve" }, replaceState: vi.fn((_state, _title, url: URL) => { current = new URL(url); historyEntries[index] = current.href; }), pushState: vi.fn((_state, _title, url: URL) => { current = new URL(url); historyEntries = historyEntries.slice(0, ++index); historyEntries.push(current.href); }) } });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { h.subscriptions.splice(0).forEach(unsubscribe => unsubscribe()); vi.unstubAllGlobals(); });

describe("guest Hub navigation handlers", () => {
  it("keeps the initial panel and Next history state when using Back/Forward", () => {
    render(hub); expect(current.hash).toBe("#guestList");
    click("Bring something"); render(hub); click("Playlist"); render(hub);
    expect(current.hash).toBe("#playlist"); expect(historyEntries).toHaveLength(3);
    expect(window.history.pushState).toHaveBeenLastCalledWith({ nextInternal: "preserve" }, "", expect.any(URL));
    for (const expected of ["potluck", "guestList"]) {
      current = new URL(historyEntries[--index]); window.dispatchEvent(new Event("popstate")); render(hub);
      expect(find(n => n.props["aria-selected"] === true)?.props.id).toBe(`hub-tab-${expected}`);
    }
    current = new URL(historyEntries[++index]); window.dispatchEvent(new Event("popstate")); render(hub);
    expect(find(n => n.props["aria-selected"] === true)?.props.id).toBe("hub-tab-potluck");
    expect(current.search).toBe("?from=invitation");
    expect(find(n => n.props.id === "hub-panel-playlist")).toBeTruthy(); // Hidden panels stay mounted.
  });
  it("restores a section on return and reload, while explicit links win", () => {
    session.setItem(hubSectionStorageKey(navigation.eventSlug), "potluck"); render(hub);
    expect(current.hash).toBe("#potluck"); h.slots = []; render(hub);
    expect(find(n => n.props["aria-selected"] === true)?.props.id).toBe("hub-tab-potluck");
    current.hash = "#playlist"; render(hub); expect(find(n => n.props["aria-selected"] === true)?.props.id).toBe("hub-tab-playlist");
  });
  it("ignores disabled/deleted sections and keeps keyboard navigation", () => {
    current.hash = "#photos"; render(hub); expect(current.hash).toBe("#guestList");
    const preventDefault = vi.fn();
    (button("Who’s Coming").props.onKeyDown as (event: unknown) => void)({ key: "End", preventDefault }); render(hub);
    expect(preventDefault).toHaveBeenCalled(); expect(current.hash).toBe("#playlist");
  });
  it("does not persist, share or modify URLs in admin/design previews", () => {
    const preview = () => HubNavigation({ modules }); render(preview); click("Playlist"); render(preview);
    expect(find(n => n.props["aria-selected"] === true)?.props.id).toBe("hub-tab-playlist");
    expect(window.history.replaceState).not.toHaveBeenCalled(); expect(window.history.pushState).not.toHaveBeenCalled();
    expect(session.getItem).not.toHaveBeenCalled(); expect(session.setItem).not.toHaveBeenCalled();
    expect(button("Copy link to this section")).toBeUndefined();
  });
  it("copies only the public section URL and offers a copy-error fallback", async () => {
    current.search = "?token=private-secret"; current.hash = "#potluck"; render(hub);
    await click("Copy link to this section"); render(hub);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://shindig.test/e/test/event#potluck");
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied")); await click("Copy link to this section"); render(hub);
    expect(find(n => n.props.href === "/e/test/event#potluck")).toBeTruthy();
  });
  it("works when session storage is denied", () => {
    session.getItem.mockImplementation(() => { throw new Error("denied"); }); session.setItem.mockImplementation(() => { throw new Error("denied"); });
    render(hub); click("Playlist"); render(hub); expect(current.hash).toBe("#playlist");
  });
});

describe("remembered private-link handlers", () => {
  it("requires an explicit click, then offers a private, non-prefetched shortcut and forget", () => {
    render(remember); expect(local.setItem).not.toHaveBeenCalled();
    click("Remember this private link on this device"); render(remember); expect(button("Forget this saved link")).toBeTruthy();
    h.slots = []; render(saved);
    const link = find(n => n.props.href === `/e/test/rsvp/${identity.token}`)!;
    expect(link.props.prefetch).toBe(false); expect(link.props.referrerPolicy).toBe("no-referrer");
    click("Forget"); render(saved); expect(tree).toBeNull(); expect(local.getItem(GUEST_LINKS_STORAGE_KEY)).toBeNull();
  });
  it("does not claim a save when browser storage fails", () => {
    local.setItem.mockImplementation(() => { throw new Error("full"); }); render(remember);
    click("Remember this private link on this device"); render(remember);
    expect(find(n => n.props.role === "alert")).toBeTruthy(); expect(button("Forget this saved link")).toBeUndefined();
  });
  it("never shows another event's links or disabled bring-something links", () => {
    rememberGuestLink(local, { ...identity, eventSlug: "other-event" });
    rememberGuestLink(local, { ...identity, kind: "potluck" });
    render(() => SavedGuestLinks({ eventSlug: identity.eventSlug })); expect(tree).toBeNull();
    render(saved); expect(find(n => n.props.href === `/e/test/bring/${identity.token}`)).toBeTruthy();
    expect(find(n => typeof n.props.href === "string" && n.props.href.includes("other-event"))).toBeUndefined();
  });
});
