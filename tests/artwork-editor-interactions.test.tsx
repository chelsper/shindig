import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, save: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [h.slots[i] as T, (next: T | ((old: T) => T)) => { h.slots[i] = typeof next === "function" ? (next as (old: T) => T)(h.slots[i] as T) : next; }] as const;
  }
  return { ...react, useState: state, useEffect: () => {}, useRef: <T,>(value: T) => state(() => ({ current: value }))[0] };
});
vi.mock("../app/admin/events/[id]/artwork/actions", () => ({ saveDraftArtwork: h.save }));
import { EventDraftArtworkEditor } from "../components/admin/event-draft-artwork-editor";
import { DraftArtworkImageControls } from "../components/admin/draft-artwork-image-controls";
import { DraftArtworkFraming } from "../components/admin/draft-artwork-framing";
import { EventDraftPreview } from "../components/admin/event-draft-preview";
import { DraftEditorActionBar } from "../components/admin/draft-editor-action-bar";
import { EditorViewToggle } from "../components/admin/editor-view-toggle";
import { draftArtworkCrop, type DraftArtwork, type DraftImageKind } from "../lib/event-draft-artwork";
import { draft, eventId, otherEventId } from "./fixtures/publication";

const settings: DraftArtwork = {
  design: { style: "coastal", palette: "fern", invitationCrop: { x: 10, y: 20, zoom: 155 } },
  invitation: { path: `event-drafts/${eventId}/invitation/${otherEventId}.png`, alt: "Invitation illustration" },
  header: { path: `event-drafts/${eventId}/header/${otherEventId}.jpg`, alt: "Garden photo", focalX: 40, focalY: 80, zoomPercent: 180 },
};
type Element = ReactElement<Record<string, unknown>>;
let tree: ReactNode;
let props: Parameters<typeof EventDraftArtworkEditor>[0];
function find(predicate: (el: Element) => boolean, node: ReactNode = tree): Element | undefined {
  if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child ?? null); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return predicate(node) ? node : find(predicate, (node.props.children as ReactNode) ?? null);
}
function render() { h.cursor = 0; tree = EventDraftArtworkEditor(props); }
const preview = () => find(el => el.type === EventDraftPreview)!.props as Parameters<typeof EventDraftPreview>[0];
const actions = () => find(el => el.type === DraftEditorActionBar)!.props;
function select(kind: DraftImageKind) { preview().onEditArtwork!(kind); render(); }
function controls(kind: DraftImageKind) {
  const props = find(el => el.type === DraftArtworkImageControls && el.props.kind === kind)!.props as Parameters<typeof DraftArtworkImageControls>[0];
  h.cursor = h.slots.length;
  return DraftArtworkImageControls(props);
}
function button(node: ReactNode, text: string) { return find(el => el.type === "button" && ([el.props.children].flat().join("") === text || el.props["aria-label"] === text), node)!; }
function click(node: Element) { (node.props.onClick as () => void)(); render(); }
function submit() { const promise = (find(el => el.type === "form")!.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault() {} }); render(); return promise; }
beforeEach(() => {
  h.slots = []; h.cursor = 0; vi.resetAllMocks();
  props = { draft, initial: { settings: structuredClone(settings), revision: 4 }, uploadConfigured: true };
  h.save.mockResolvedValue({ ok: true, revision: 5 }); render();
});
afterEach(() => vi.unstubAllGlobals());

describe("direct artwork editor interactions", () => {
  it("selects header controls from the mobile preview without dirtying, saving or publishing", () => {
    (find(el => el.type === EditorViewToggle)!.props.onChange as (view: string) => void)("preview"); render();
    select("header");
    expect(find(el => el.type === EditorViewToggle)!.props.view).toBe("edit");
    expect(preview().view).toBe("hub");
    expect(controls("header").props.hidden).toBe(false); expect(controls("invitation").props.hidden).toBe(true);
    expect(actions().dirty).toBe(false); expect(h.save).not.toHaveBeenCalled();
    select("invitation"); expect(preview().view).toBe("invitation"); expect(actions().dirty).toBe(false);
  });
  it.each(["header", "invitation"] as const)("resetting the %s changes only its framing and remains an unsaved draft", kind => {
    select(kind); click(button(controls(kind), "Reset phone crop"));
    const next = preview().artwork;
    if (kind === "header") { expect(next.header).toEqual({ ...settings.header, focalX: 50, focalY: 50, zoomPercent: 100, desktopCrop: { x: 40, y: 80, zoom: 180 } }); expect(next.design).toEqual(settings.design); }
    else { expect(next.header).toEqual(settings.header); expect(next.design).toEqual({ ...settings.design, invitationCrop: { x: 50, y: 50, zoom: 100 }, invitationDesktopCrop: settings.design!.invitationCrop }); }
    expect(next.invitation).toEqual(settings.invitation); expect(actions().dirty).toBe(true); expect(h.save).not.toHaveBeenCalled();
  });
  it("repositions the header fallback without changing its source or invitation crop", () => {
    props.initial.settings.header = { ...settings.header, path: null, alt: "" }; h.slots = []; render(); select("header");
    const crop = find(el => el.type === DraftArtworkFraming, controls("header"))!;
    (crop.props.onChange as (next: DraftArtwork) => void)({ ...preview().artwork, header: { ...preview().artwork.header, focalY: 12 } }); render();
    expect(preview().artwork.header).toEqual({ ...settings.header, path: null, alt: "", focalY: 12 });
    expect(preview().artwork.design).toEqual(settings.design);
    expect(button(controls("header"), "Replace Event Hub header")).toBeTruthy();
  });
  it("opens the selected image picker without saving or mutating artwork", () => {
    select("header"); const panel = controls("header"), picker = find(el => el.type === "input" && el.props.type === "file", panel)!;
    const open = vi.fn(); (picker.props.ref as { current: unknown }).current = { click: open };
    click(button(panel, "Replace Event Hub header"));
    expect(open).toHaveBeenCalledOnce(); expect(actions().dirty).toBe(false); expect(preview().artwork).toEqual(settings);
    expect(picker.props.accept).toContain("image/png"); expect(picker.props.hidden).toBe(true);
  });
  it("only uploads a replacement to the selected private draft slot; save stays explicit", async () => {
    select("header"); const panel = controls("header");
    const response = { ok: true, json: async () => ({ path: `event-drafts/${eventId}/header/${eventId}.png` }) };
    const fetch = vi.fn().mockResolvedValue(response); vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 600, height: 400, close: vi.fn() }));
    const input = find(el => el.type === "input" && el.props.type === "file", panel)!;
    (input.props.onChange as (event: unknown) => void)({ target: { files: [new File(["synthetic"], "test.png", { type: "image/png" })], value: "test.png" } }); render();
    expect(preview().artworkEditingDisabled).toBe(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await vi.waitFor(() => { render(); expect(actions().pending).toBe(false); });
    expect(fetch.mock.calls[0][0]).toBe(`/admin/events/${eventId}/artwork/image`);
    expect((fetch.mock.calls[0][1].body as FormData).get("kind")).toBe("header");
    expect(preview().artwork.invitation).toEqual(settings.invitation); expect(preview().artwork.design).toEqual(settings.design);
    expect(preview().artwork.header.path).toBe(`event-drafts/${eventId}/header/${eventId}.png`);
    expect(h.save).not.toHaveBeenCalled(); expect(actions().dirty).toBe(true);
  });
  it("does not lose the previous image on an upload failure", async () => {
    select("header"); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 600, height: 400, close: vi.fn() }));
    const input = find(el => el.type === "input" && el.props.type === "file", controls("header"))!;
    (input.props.onChange as (event: unknown) => void)({ target: { files: [new File(["test"], "test.png", { type: "image/png" })], value: "" } });
    await vi.waitFor(() => { render(); expect(actions().error).toContain("couldn’t upload"); });
    expect(preview().artwork).toEqual(settings); expect(actions().dirty).toBe(false); expect(h.save).not.toHaveBeenCalled();
  });
  it("keeps original invitations uncropped and handles missing images or storage", () => {
    delete props.initial.settings.design; h.slots = []; render();
    expect(button(controls("invitation"), "Reposition")).toBeUndefined(); expect(button(controls("invitation"), "Reset phone crop")).toBeUndefined();
    props.initial.settings.invitation.path = null; props.initial.settings.header.path = null; props.uploadConfigured = false; h.slots = []; render(); select("header");
    const panel = controls("header");
    for (const name of ["Choose Event Hub header", "Reposition", "Reset phone crop"]) expect(button(panel, name).props.disabled).toBe(true);
    click(button(panel, "Reset phone crop")); expect(actions().dirty).toBe(false);
  });
  it("locks preview actions during saves, persists through the existing action and never publishes", async () => {
    let finish!: (value: unknown) => void; h.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    select("header"); click(button(controls("header"), "Reset phone crop")); const task = submit();
    expect(preview().artworkEditingDisabled).toBe(true); select("invitation"); expect(preview().view).toBe("hub");
    click(button(controls("header"), "Reset phone crop")); expect(h.save).toHaveBeenCalledOnce();
    expect(h.save).toHaveBeenCalledWith({ id: eventId, revision: 4, settings: preview().artwork });
    finish({ ok: true, revision: 5 }); await task; render();
    expect(actions().dirty).toBe(false); expect(actions().status).toContain("Nothing has been published"); expect(preview().artworkEditingDisabled).toBe(false);
  });
  it("preserves edits and blocks preview editing on a revision conflict", async () => {
    h.save.mockResolvedValue({ ok: false, conflict: true, message: "Reopen saved artwork." });
    select("header"); click(button(controls("header"), "Reset phone crop")); await submit(); render();
    expect(actions().dirty).toBe(true); expect(actions().conflict).toBe(true); expect(preview().artworkEditingDisabled).toBe(true);
    select("invitation"); expect(preview().view).toBe("hub");
  });
  it.each(["invitation", "header"] as const)("switches %s size without dirtying, then resets/copies only the selected crop and saves both", async kind => {
    select(kind); click(button(controls(kind), "Desktop crop"));
    expect(actions().dirty).toBe(false); expect(preview().device).toBe("desktop");
    click(button(controls(kind), "Reset desktop crop"));
    expect(draftArtworkCrop(preview().artwork, kind, "phone")).toEqual(draftArtworkCrop(settings, kind, "phone"));
    expect(draftArtworkCrop(preview().artwork, kind, "desktop")).toEqual({ x: 50, y: 50, zoom: 100 });
    click(button(controls(kind), "Phone crop"));
    click(button(controls(kind), "Copy desktop crop to phone"));
    expect(draftArtworkCrop(preview().artwork, kind, "phone")).toEqual({ x: 50, y: 50, zoom: 100 });
    const edited = preview().artwork;
    await submit(); render(); expect(h.save).toHaveBeenLastCalledWith({ id: eventId, revision: 4, settings: edited });
    expect(actions().dirty).toBe(false);
  });
});
