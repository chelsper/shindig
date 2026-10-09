import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { draft } from "./fixtures/publication";

// Real handlers with deterministic hooks; browser QA covers focus and layout.
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[], find: vi.fn(), save: vi.fn() }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [harness.slots[index] as T, (value: T | ((previous: T) => T)) => {
      harness.slots[index] = typeof value === "function" ? (value as (previous: T) => T)(harness.slots[index] as T) : value;
    }] as const;
  }
  return { ...react, useState: state, useRef: <T,>(initial: T) => state(() => ({ current: initial }))[0], useId: () => "setup-sections", useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); } };
});
vi.mock("../app/admin/events/[id]/location/actions", () => ({ findEventAddress: harness.find, saveEventLocation: harness.save }));
import { EventSetupNavigation } from "../components/admin/event-setup-navigation";
import { EventLocationEditor } from "../components/admin/event-location-editor";
import { DraftEditorActionBar } from "../components/admin/draft-editor-action-bar";

type Element = ReactElement<Record<string, unknown>>;
let tree: ReactElement, kind: "nav" | "location", nav: Parameters<typeof EventSetupNavigation>[0], location: Parameters<typeof EventLocationEditor>[0];
const match = { matchedAddress: "123 EXAMPLE LANE", latitude: 30, longitude: -81 };
const saved = { ...match, address: draft.address, source: "census" as const };
function render() { harness.cursor = 0; harness.effects = []; tree = kind === "nav" ? EventSetupNavigation(nav) : EventLocationEditor(location); }
function findAll(predicate: (element: Element) => boolean, value: ReactNode = tree): Element[] {
  if (Array.isArray(value)) return value.flatMap(child => findAll(predicate, child ?? null));
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [...(predicate(value) ? [value] : []), ...findAll(predicate, (value.props.children as ReactNode) ?? null)];
}
function find(predicate: (element: Element) => boolean) { const result = findAll(predicate)[0]; if (!result) throw Error("Missing control"); return result; }
function text(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return text(value.props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function change(label: string, value: string | boolean) {
  const parent = find(el => el.type === "label" && text(el).startsWith(label));
  const input = findAll(el => el.type === "input", parent)[0];
  (input.props.onChange as (e: { target: { value?: string; checked?: boolean } }) => void)({ target: typeof value === "boolean" ? { checked: value } : { value } }); render();
}
function bar() { return find(el => el.type === DraftEditorActionBar).props; }
function submit() { const task = (find(el => el.type === "form").props.onSubmit as (e: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} }); render(); return task; }
function lookup() { const task = (find(el => el.type === "button" && text(el).includes("Find" )).props.onClick as () => Promise<void>)(); render(); return task; }
function clickEvent() { return { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; }
function load(next: typeof kind) { kind = next; harness.slots = []; render(); }
function manual() { change("Use manual coordinates", true); change("Latitude", "30"); change("Longitude", "-81"); change("I checked this is the event location.", true); }
beforeEach(() => {
  vi.resetAllMocks(); nav = { id: draft.id, current: "location" }; location = { draft };
  harness.find.mockResolvedValue({ ok: true, matches: [match] }); harness.save.mockResolvedValue({ ok: true, revision: 3, location: saved });
  vi.stubGlobal("window", { confirm: vi.fn(() => false), addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("mobile setup navigation", () => {
  it("opens a single section list, closes on Escape and restores trigger focus", () => {
    load("nav"); const trigger = () => find(el => el.type === "button");
    expect(trigger().props["aria-expanded"]).toBe(false); expect(trigger().props["aria-controls"]).toBe("setup-sections");
    (trigger().props.onClick as () => void)(); render(); expect(trigger().props["aria-expanded"]).toBe(true);
    const focus = vi.fn(); (trigger().props.ref as { current: unknown }).current = { focus };
    (find(el => el.type === "nav").props.onKeyDown as (e: { key: string }) => void)({ key: "Escape" }); render();
    expect(trigger().props["aria-expanded"]).toBe(false); expect(focus).toHaveBeenCalledOnce();
  });
  it("runs the existing leave guard on every section, Back/Next and checklist link", () => {
    nav.onNavigate = vi.fn(event => event.preventDefault()); load("nav");
    (find(el => el.type === "button").props.onClick as () => void)(); render();
    const links = findAll(el => typeof el.props.href === "string");
    for (const link of links) { const event = clickEvent(); (link.props.onClick as (event: ReturnType<typeof clickEvent>) => void)(event); expect(event.defaultPrevented).toBe(true); }
    render(); expect(find(el => el.type === "button").props["aria-expanded"]).toBe(true);
    expect(nav.onNavigate).toHaveBeenCalledTimes(links.length);
  });
  it("closes after allowed navigation without saving, publishing or changing routes", () => {
    nav.onNavigate = vi.fn(); load("nav"); (find(el => el.type === "button").props.onClick as () => void)(); render();
    const next = find(el => el.props["aria-label"] === "Next: Artwork & design");
    expect(next.props.href).toBe(`/admin/events/${draft.id}/artwork`);
    (next.props.onClick as (e: ReturnType<typeof clickEvent>) => void)(clickEvent()); render();
    expect(find(el => el.type === "button").props["aria-expanded"]).toBe(false); expect(harness.save).not.toHaveBeenCalled();
  });
});

describe("location editing and persistent actions", () => {
  it("requires valid coordinates and explicit confirmation, without silently treating blanks as zero", async () => {
    load("location"); expect(bar().saveAllowed).toBe(false);
    change("Use manual coordinates", true); change("Latitude", "91"); change("Longitude", ""); await submit(); render();
    expect(bar().error).toContain("valid location"); expect(harness.save).not.toHaveBeenCalled();
    change("Latitude", "0"); change("Longitude", "0"); await submit(); render(); expect(harness.save).not.toHaveBeenCalled();
    change("I checked this is the event location.", true); expect(bar().saveAllowed).toBe(true);
    change("Latitude", "1"); expect(bar().saveAllowed).toBe(false);
  });
  it("locks rapid submits and navigation, preserves success, then uses the acknowledged revision", async () => {
    load("location"); manual(); let finish!: (value: unknown) => void;
    harness.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = submit(), second = submit(); expect(harness.save).toHaveBeenCalledOnce(); expect(bar().pending).toBe(true);
    const event = clickEvent(); (bar().onLeave as (e: typeof event) => void)(event); expect(event.defaultPrevented).toBe(true); expect(window.confirm).not.toHaveBeenCalled();
    finish({ ok: true, revision: 3, location: saved }); await Promise.all([first, second]); render();
    expect(bar()).toMatchObject({ dirty: false, pending: false, error: null, reviewHref: `/admin/events/${draft.id}/setup`, reviewLabel: "Continue setup" });
    expect(bar().status).toContain("Nothing has been published"); await submit(); expect(harness.save).toHaveBeenCalledOnce();
    manual(); harness.save.mockResolvedValue({ ok: true, revision: 4, location: saved }); await submit(); expect(harness.save.mock.lastCall?.[1]).toBe(3);
  });
  it("only searches explicitly and saves the selected match after confirmation", async () => {
    load("location"); expect(harness.find).not.toHaveBeenCalled(); await lookup(); render();
    expect(harness.find).toHaveBeenCalledWith(draft.id, draft.revision); expect(bar().dirty).toBe(false);
    (find(el => el.props.name === "address-match").props.onChange as () => void)(); render();
    expect(bar().dirty).toBe(true); expect(bar().saveAllowed).toBe(false);
    change("I checked this is the event location.", true); await submit();
    expect(harness.save).toHaveBeenCalledWith(draft.id, draft.revision, { ...match, source: "census" }, true);
  });
  it.each(["retry", "conflict", "throw"])("retains location choices after %s and never claims success", async (mode) => {
    load("location"); manual();
    if (mode === "throw") harness.save.mockRejectedValue(Error("private SQL"));
    else harness.save.mockResolvedValue({ ok: false, message: "Try again.", conflict: mode === "conflict" });
    await submit(); render();
    expect(bar().dirty).toBe(true); expect(bar().error).toBeTruthy(); expect(bar().error).not.toContain("private SQL"); expect(bar().status).not.toContain("Location saved");
    if (mode !== "retry") { expect(bar().conflict).toBe(true); expect(bar().reopenHref).toBe(`/admin/events/${draft.id}/location`); await submit(); expect(harness.save).toHaveBeenCalledOnce(); }
    else { harness.save.mockResolvedValue({ ok: true, revision: 3, location: saved }); await submit(); render(); expect(bar().dirty).toBe(false); }
  });
  it("guards header, address, section and recovery navigation plus browser unload", () => {
    load("location"); manual();
    const callbacks = [...findAll(el => typeof el.props.href === "string").map(el => el.props.onClick), find(el => el.type === EventSetupNavigation).props.onNavigate, bar().onLeave];
    for (const callback of callbacks) { const event = clickEvent(); (callback as (e: typeof event) => void)(event); expect(event.defaultPrevented).toBe(true); }
    expect(window.confirm).toHaveBeenCalledWith("Leave without saving your location choice?");
    const cleanup = harness.effects[0](); expect(window.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function)); cleanup?.(); expect(window.removeEventListener).toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true); const event = clickEvent(); (bar().onLeave as (e: typeof event) => void)(event); expect(event.defaultPrevented).toBe(false);
  });
  it("locks repeated searches and recovers safely from provider or stale-draft failures", async () => {
    load("location"); let finish!: (value: unknown) => void; harness.find.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = lookup(), second = lookup(); expect(harness.find).toHaveBeenCalledOnce(); expect(bar().pending).toBe(true);
    finish({ ok: false, message: "Search unavailable" }); await Promise.all([first, second]); render(); expect(bar().error).toBe("Search unavailable"); expect(bar().pending).toBe(false);
    harness.find.mockResolvedValue({ ok: false, conflict: true, message: "Reopen draft" }); await lookup(); render(); expect(bar().conflict).toBe(true); await lookup(); expect(harness.find).toHaveBeenCalledTimes(2);
  });
  it("does not reuse a confirmation for another address or allow a blank-address write", async () => {
    location = { draft: { ...draft, address: "", location: saved } }; load("location");
    expect(text(tree)).not.toContain("Location confirmed"); expect(bar().saveAllowed).toBe(false); await submit(); expect(harness.save).not.toHaveBeenCalled();
  });
});
