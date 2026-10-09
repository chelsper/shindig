import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type FormEvent, type ReactElement, type ReactNode } from "react";
import { EMPTY_EVENT_DRAFT, type EventDraft } from "../lib/event-drafts";
import type { SaveDraftResult } from "../app/admin/events/actions";

// A small hook harness exercises the actual editor handlers without adding a
// browser/DOM dependency. Real DOM focus, responsiveness and forms get browser QA.
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, tasks: [] as Promise<void>[], save: vi.fn(), replace: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [harness.slots[index] as T, (value: T | ((previous: T) => T)) => {
      harness.slots[index] = typeof value === "function" ? (value as (previous: T) => T)(harness.slots[index] as T) : value;
    }] as const;
  }
  return { ...react, useState: state, useEffect: () => {}, useRef: <T,>(initial: T) => state(() => ({ current: initial }))[0],
    useTransition: () => {
      const [pending, setPending] = state(false);
      return [pending, (task: () => Promise<void>) => { setPending(true); harness.tasks.push(task().finally(() => setPending(false))); }];
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: harness.replace }) }));
vi.mock("../app/admin/events/actions", () => ({ saveEventDraft: harness.save }));
import { EventDraftEditor } from "../components/admin/event-draft-editor";
import { EventEditorActions } from "../components/admin/event-editor-actions";
import { EventEditorPreview } from "../components/admin/event-editor-preview";

const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const draft: EventDraft = { ...EMPTY_EVENT_DRAFT, id, title: "Garden supper", status: "draft", revision: 2, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
let props: Parameters<typeof EventDraftEditor>[0];
let tree: ReactElement;
function render() { harness.cursor = 0; tree = EventDraftEditor(props); }
function find(predicate: (node: ReactElement<Record<string, unknown>>) => boolean, value: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) { for (const child of value) { const found = find(predicate, child ?? null); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, (value.props.children as ReactNode) ?? null);
}
function change(name: string, value: string) {
  const control = find((node) => node.props.name === name)!;
  (control.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); render();
}
function submit() { (find((node) => node.type === "form")!.props.onSubmit as (event: FormEvent<HTMLFormElement>) => void)({ preventDefault() {} } as FormEvent<HTMLFormElement>); render(); }
function actions() { return find((node) => node.type === EventEditorActions)!.props; }
function preview() { return find((node) => node.type === EventEditorPreview)!.props; }
beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.tasks = []; vi.resetAllMocks();
  props = { id, initialDraft: draft, timeZones: ["America/New_York"] };
  harness.save.mockResolvedValue({ ok: true, id, revision: 3 }); render();
});
afterEach(() => vi.unstubAllGlobals());

describe("event editor controller interactions", () => {
  it("updates the preview as the host types and keeps edits while switching mobile views", () => {
    change("title", "New garden party"); change("description", "Bring a friend.");
    expect(preview().fields).toMatchObject({ title: "New garden party", description: "Bring a friend." });
    expect(actions().dirty).toBe(true);
    const toggle = find((node) => node.type === "button" && node.props["aria-controls"] === "event-preview-panel")!;
    (toggle.props.onClick as () => void)(); render();
    expect(find((node) => node.type === "form")!.props.className).toContain("hidden lg:block");
    expect(find((node) => node.props["aria-controls"] === "event-preview-panel")!.props["aria-pressed"]).toBe(true);
    expect(preview().fields).toMatchObject({ title: "New garden party" });
    expect(harness.save).not.toHaveBeenCalled();
  });
  it("locks rapid submits, disables fields while saving and advances revision only on success", async () => {
    let resolve!: (result: SaveDraftResult) => void;
    harness.save.mockReturnValue(new Promise<SaveDraftResult>((done) => { resolve = done; }));
    change("title", "New name"); submit(); submit();
    expect(harness.save).toHaveBeenCalledTimes(1); expect(actions().pending).toBe(true);
    expect(find((node) => node.type === "fieldset")!.props.disabled).toBe(true);
    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({ id, revision: 2, fields: expect.objectContaining({ title: "New name" }) }));
    resolve({ ok: true, id, revision: 3 }); await Promise.all(harness.tasks); render();
    expect(actions()).toMatchObject({ pending: false, saved: true, dirty: false, revision: 3, error: null });
    expect(harness.replace).not.toHaveBeenCalled();
    change("title", "Another edit"); harness.save.mockResolvedValue({ ok: true, id, revision: 4 }); submit(); await Promise.all(harness.tasks);
    expect(harness.save.mock.lastCall?.[0].revision).toBe(3);
  });
  it.each([false, true])("retains edits and exposes no success on a %s thrown failure", async (throws) => {
    if (throws) harness.save.mockRejectedValue(new Error("private detail")); else harness.save.mockResolvedValue({ ok: false, message: "Try again." });
    change("title", "Keep this name"); submit(); await Promise.all(harness.tasks); render();
    expect(actions()).toMatchObject({ dirty: true, saved: false, revision: 2, pending: false });
    expect(actions().error).toBeTruthy(); expect(actions().error).not.toContain("private detail");
    expect(preview().fields).toMatchObject({ title: "Keep this name" }); expect(harness.replace).not.toHaveBeenCalled();
  });
  it("blocks stale draft retries until the host reopens the saved version", async () => {
    harness.save.mockResolvedValue({ ok: false, conflict: true, message: "Reopen the draft." });
    change("title", "Stale edit"); submit(); await Promise.all(harness.tasks); render();
    expect(actions()).toMatchObject({ conflict: true, dirty: true, saved: false }); submit();
    expect(harness.save).toHaveBeenCalledTimes(1);
  });
  it("validates dates even when the form is hidden behind mobile preview", () => {
    change("startsAtLocal", "2026-03-08T02:30"); submit();
    expect(actions().error).toContain("daylight saving"); expect(harness.save).not.toHaveBeenCalled();
    change("title", " "); submit(); expect(actions().saved).toBe(false);
  });
  it("preserves new-draft setup and requested-style handoff instead of publishing", async () => {
    harness.slots = []; props = { id, timeZones: ["America/New_York"], requestedDesign: "coastal" }; render();
    change("title", "Fresh party"); submit(); await Promise.all(harness.tasks); render();
    expect(harness.save.mock.lastCall?.[0].revision).toBe(0);
    expect(harness.replace).toHaveBeenCalledWith(`/admin/events/${id}/artwork?style=coastal`);
  });
  it("guards navigation away from unsaved work", () => {
    const confirm = vi.fn(() => false); vi.stubGlobal("window", { confirm });
    change("title", "Unsaved name");
    const preventDefault = vi.fn(); (actions().onLeave as (e: { preventDefault: () => void }) => void)({ preventDefault });
    expect(confirm).toHaveBeenCalledWith("Leave without saving your draft changes?"); expect(preventDefault).toHaveBeenCalled();
  });
});
