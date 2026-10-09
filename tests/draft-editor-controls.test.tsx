import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { EMPTY_DRAFT_ARTWORK, type DraftArtwork } from "../lib/event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { draft, eventId, otherEventId } from "./fixtures/publication";

// Exercise the real handlers with a small hook harness. Layout, native controls
// and the mounted previews are also checked in a real local browser.
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, artwork: vi.fn(), settings: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [harness.slots[index] as T, (value: T | ((previous: T) => T)) => {
      harness.slots[index] = typeof value === "function" ? (value as (previous: T) => T)(harness.slots[index] as T) : value;
    }] as const;
  }
  return { ...react, useState: state, useEffect: () => {}, useRef: <T,>(initial: T) => state(() => ({ current: initial }))[0] };
});
vi.mock("../app/admin/events/[id]/artwork/actions", () => ({ saveDraftArtwork: harness.artwork }));
vi.mock("../app/admin/events/[id]/settings/actions", () => ({ saveDraftSettings: harness.settings }));
import { EventDraftArtworkEditor } from "../components/admin/event-draft-artwork-editor";
import { EventDraftSettingsEditor } from "../components/admin/event-draft-settings-editor";
import { DraftDesignControls } from "../components/admin/draft-design-controls";
import { DraftEditorActionBar } from "../components/admin/draft-editor-action-bar";
import { EditorViewToggle } from "../components/admin/editor-view-toggle";
import { EventDraftPreview } from "../components/admin/event-draft-preview";
import { DraftRsvpPreview, DraftHubPreview } from "../components/admin/event-draft-experience-preview";

type Element = ReactElement<Record<string, unknown>>;
const path = `event-drafts/${eventId}/invitation/${otherEventId}.png`;
const art: DraftArtwork = { ...EMPTY_DRAFT_ARTWORK, invitation: { path, alt: "Original flowers" }, design: { style: "coastal", invitationCrop: { x: 50, y: 50, zoom: 100 } } };
let kind: "artwork" | "settings", tree: ReactElement;
let artProps: Parameters<typeof EventDraftArtworkEditor>[0];
let settingsProps: Parameters<typeof EventDraftSettingsEditor>[0];
function render() { harness.cursor = 0; tree = kind === "artwork" ? EventDraftArtworkEditor(artProps) : EventDraftSettingsEditor(settingsProps); }
function find(predicate: (el: Element) => boolean, value: ReactNode = tree): Element | undefined {
  if (Array.isArray(value)) { for (const child of value) { const found = find(predicate, child ?? null); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, value.props.children as ReactNode ?? null);
}
function text(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return text(value.props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function control(label: string) {
  const parent = find(el => el.type === "label" && text(el).startsWith(label));
  if (!parent) throw new Error(`No label ${label}`);
  return find(el => ["input", "select", "textarea"].includes(el.type as string), parent)!;
}
function change(label: string, value: string | boolean) {
  (control(label).props.onChange as (e: { target: { value?: string; checked?: boolean } }) => void)({ target: typeof value === "boolean" ? { checked: value } : { value } }); render();
}
function bar() { return find(el => el.type === DraftEditorActionBar)!.props; }
function toggle(view: "edit" | "preview") { (find(el => el.type === EditorViewToggle)!.props.onChange as (view: string) => void)(view); render(); }
function submit() { const result = (find(el => el.type === "form")!.props.onSubmit as (e: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} }); render(); return result; }
function design(next: DraftArtwork) { (find(el => el.type === DraftDesignControls)!.props.onChange as (art: DraftArtwork) => void)(next); render(); }
function load(editor: typeof kind) { kind = editor; harness.slots = []; render(); }
beforeEach(() => {
  vi.resetAllMocks(); harness.artwork.mockResolvedValue({ ok: true, revision: 3 }); harness.settings.mockResolvedValue({ ok: true, revision: 3 });
  artProps = { draft, initial: { settings: art, revision: 2 }, uploadConfigured: true };
  settingsProps = { draft, artwork: art, initial: { settings: DEFAULT_DRAFT_SETTINGS, revision: 2 } };
});
afterEach(() => vi.unstubAllGlobals());

describe("Artwork & Design editor safeguards", () => {
  it("retains unsaved style/crops and device/screen selections when switching mobile panels", () => {
    load("artwork");
    const next = { ...art, design: { style: "after-dark" as const, invitationCrop: { x: 12, y: 78, zoom: 160 } } };
    design(next); toggle("preview");
    expect(find(el => el.type === EventDraftPreview)!.props.artwork).toEqual(next);
    expect(find(el => el.type === "form")!.props.className).toContain("hidden lg:block");
    (find(el => el.type === "button" && text(el) === "Desktop")!.props.onClick as () => void)(); render();
    (find(el => el.type === "button" && text(el) === "Event Hub")!.props.onClick as () => void)(); render();
    toggle("edit"); toggle("preview");
    expect(find(el => el.type === EventDraftPreview)!.props).toMatchObject({ artwork: next, view: "hub", fullPage: true });
    expect(bar().dirty).toBe(true); expect(harness.artwork).not.toHaveBeenCalled();
  });
  it("validates image descriptions from hidden-form preview without a storage request", async () => {
    load("artwork"); change("Invitation image description", " "); toggle("preview"); await submit(); render();
    expect(bar().error).toContain("description"); expect(harness.artwork).not.toHaveBeenCalled(); expect(bar().dirty).toBe(true);
  });
  it("retains custom type/colors across mobile previews and retries a failed save without publishing", async () => {
    load("artwork");
    const next: DraftArtwork = { ...art, design: { ...art.design!, palette: "fern", typography: "modern", titleWeight: "bold", titleStyle: "italic" } };
    design(next); toggle("preview"); toggle("edit");
    harness.artwork.mockResolvedValueOnce({ ok: false, message: "Please try again." });
    await submit(); render();
    expect(bar().dirty).toBe(true);
    expect(find(el => el.type === EventDraftPreview)!.props.artwork).toEqual(next);
    expect(harness.artwork).toHaveBeenLastCalledWith({ id: draft.id, revision: 2, settings: next });
    await submit(); render();
    expect(bar().dirty).toBe(false); expect(bar().status).toContain("Nothing has been published");
    expect(find(el => el.type === DraftDesignControls)!.props.settings).toEqual(next);
  });
  it("locks rapid saves, confirms success, advances revision, and does not resave clean artwork", async () => {
    load("artwork"); change("Invitation image description", "Fresh flowers");
    let finish!: (value: unknown) => void; harness.artwork.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = submit(), second = submit(); expect(harness.artwork).toHaveBeenCalledTimes(1);
    expect(bar().pending).toBe(true); expect(find(el => el.type === "fieldset")!.props.disabled).toBe(true);
    finish({ ok: true, revision: 3 }); await Promise.all([first, second]); render();
    expect(bar()).toMatchObject({ dirty: false, pending: false, error: null }); expect(bar().status).toContain("saved to your private draft");
    await submit(); expect(harness.artwork).toHaveBeenCalledTimes(1);
    change("Invitation image description", "More flowers"); harness.artwork.mockResolvedValue({ ok: true, revision: 4 }); await submit();
    expect(harness.artwork.mock.lastCall?.[0].revision).toBe(3);
  });
  it.each(["failure", "throw", "conflict"])("keeps edits after %s and offers the correct recovery route", async (mode) => {
    load("artwork"); change("Invitation image description", "Keep me");
    if (mode === "throw") harness.artwork.mockRejectedValue(new Error("private token"));
    else harness.artwork.mockResolvedValue({ ok: false, message: "Try again.", conflict: mode === "conflict" });
    await submit(); render();
    expect(bar().dirty).toBe(true); expect(bar().error).toBeTruthy(); expect(bar().error).not.toContain("private token");
    expect(bar().status).not.toContain("saved to your private draft");
    expect(bar().reopenHref).toBe(`/admin/events/${eventId}/artwork`);
    expect(find(el => el.type === EventDraftPreview)!.props.artwork).toMatchObject({ invitation: { alt: "Keep me" } });
    if (mode === "conflict") { await submit(); expect(harness.artwork).toHaveBeenCalledTimes(1); }
  });
  it("locks upload/save/navigation together and keeps an uploaded image private and unsaved", async () => {
    load("artwork");
    const close = vi.fn(); vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 1200, close }));
    let finish!: (value: unknown) => void;
    const fetch = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetch);
    const upload = control("Upload invitation artwork").props.onChange as (e: unknown) => void;
    const file = new File(["test"], "flowers.png", { type: "image/png" });
    upload({ target: { files: [file], value: "flowers.png" } }); render();
    upload({ target: { files: [file], value: "flowers.png" } }); await submit();
    expect(bar().pending).toBe(true); expect(harness.artwork).not.toHaveBeenCalled();
    const preventDefault = vi.fn(); (bar().onLeave as (e: unknown) => void)({ preventDefault }); expect(preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const nextPath = `event-drafts/${eventId}/invitation/30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6.png`;
    finish({ ok: true, json: async () => ({ path: nextPath }) });
    await vi.waitFor(() => { render(); expect(bar().pending).toBe(false); });
    expect(close).toHaveBeenCalled(); expect(bar().dirty).toBe(true); expect(bar().status).toContain("Uploaded privately");
    expect(find(el => el.type === EventDraftPreview)!.props.artwork).toMatchObject({ invitation: { path: nextPath } });
    expect(harness.artwork).not.toHaveBeenCalled();
  });
  it("leaves existing art untouched on upload failure or an unsafe returned path", async () => {
    load("artwork"); vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 1200, close() {} }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: "https://unsafe.example/art.png" }) }));
    (control("Upload invitation artwork").props.onChange as (e: unknown) => void)({ target: { files: [new File(["test"], "art.png", { type: "image/png" })], value: "art.png" } });
    await vi.waitFor(() => { render(); expect(bar().error).toBeTruthy(); });
    expect(find(el => el.type === EventDraftPreview)!.props.artwork).toEqual(art); expect(bar().dirty).toBe(false);
  });
});

describe("RSVP & Hub editor safeguards", () => {
  it("retains changed rules and enabled modules in the preview without a save", () => {
    load("settings"); change("Maximum guests per RSVP", "4"); change("Allow an optional comment", false); change("Guest List", false); change("Playlist", true);
    toggle("preview");
    expect(find(el => el.type === EventDraftPreview)!.props.view).toBe("hub");
    expect(find(el => el.type === DraftHubPreview)!.props.settings).toMatchObject({ features: { guestList: false, playlist: true } });
    (find(el => el.type === "button" && text(el) === "Invitation")!.props.onClick as () => void)(); render();
    expect(find(el => el.type === DraftRsvpPreview)!.props.settings).toMatchObject({ rsvp: { maxPartySize: 4, allowComments: false } });
    toggle("edit"); expect(control("Maximum guests per RSVP").props.value).toBe(4); expect(harness.settings).not.toHaveBeenCalled();
  });
  it("allows confirming unchanged initial defaults but not repeatedly saving clean stored settings", async () => {
    settingsProps.initial.revision = 0; load("settings"); expect(bar()).toMatchObject({ saveAllowed: true, reviewReady: false });
    await submit(); render(); expect(harness.settings.mock.lastCall?.[0].revision).toBe(0);
    expect(bar()).toMatchObject({ dirty: false, saveAllowed: false, reviewReady: true });
    await submit(); expect(harness.settings).toHaveBeenCalledTimes(1);
  });
  it("validates required capacity and event-timezone deadline even from hidden-form preview", async () => {
    load("settings"); change("Limit total event attendance", true); toggle("preview"); await submit(); render();
    expect(bar().error).toContain("capacity"); change("Total guest capacity", "0"); await submit(); render(); expect(bar().error).toContain("capacity");
    change("Total guest capacity", "12"); change("Set an RSVP deadline", true); await submit(); render(); expect(bar().error).toContain("timezone");
    change("Reply by", "2026-03-08T02:30"); await submit(); render(); expect(bar().error).toContain("daylight saving");
    expect(harness.settings).not.toHaveBeenCalled(); expect(bar().dirty).toBe(true);
    change("Reply by", "2026-11-07T17:00"); await submit(); render();
    expect(harness.settings.mock.lastCall?.[0].settings.rsvp).toMatchObject({ capacity: 12, deadlineAtUtc: "2026-11-08T01:00:00.000Z" });
  });
  it("locks repeated submissions and advances the saved revision", async () => {
    load("settings"); change("Maximum guests per RSVP", "3");
    let finish!: (value: unknown) => void; harness.settings.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = submit(), second = submit(); expect(harness.settings).toHaveBeenCalledTimes(1); expect(bar().pending).toBe(true);
    finish({ ok: true, revision: 3 }); await Promise.all([first, second]); render();
    expect(bar()).toMatchObject({ dirty: false, pending: false, error: null }); expect(bar().status).toContain("Choices saved");
    change("Maximum guests per RSVP", "5"); harness.settings.mockResolvedValue({ ok: true, revision: 4 }); await submit();
    expect(harness.settings.mock.lastCall?.[0].revision).toBe(3);
  });
  it.each(["failure", "throw", "conflict"])("retains choices without false success after %s", async (mode) => {
    load("settings"); change("Maximum guests per RSVP", "3");
    if (mode === "throw") harness.settings.mockRejectedValue(new Error("private token"));
    else harness.settings.mockResolvedValue({ ok: false, message: "Try again.", conflict: mode === "conflict" });
    await submit(); render(); expect(bar()).toMatchObject({ dirty: true, pending: false }); expect(bar().error).toBeTruthy();
    expect(bar().error).not.toContain("private token"); expect(bar().status).not.toContain("Choices saved");
    expect(bar().reopenHref).toBe(`/admin/events/${eventId}/settings`); expect(control("Maximum guests per RSVP").props.value).toBe(3);
    if (mode === "conflict") { await submit(); expect(harness.settings).toHaveBeenCalledTimes(1); }
  });
});

it.each(["artwork", "settings"] as const)("protects unsaved %s navigation", editor => {
  load(editor); if (editor === "artwork") change("Invitation image description", "Keep me"); else change("Maximum guests per RSVP", "3");
  const confirm = vi.fn(() => false); vi.stubGlobal("window", { confirm }); const preventDefault = vi.fn();
  (bar().onLeave as (e: unknown) => void)({ preventDefault }); expect(confirm).toHaveBeenCalled(); expect(preventDefault).toHaveBeenCalled();
});
