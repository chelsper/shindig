import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pending: false, jobs: [] as Promise<void>[], save: vi.fn(), onSaved: vi.fn(), onCancel: vi.fn() }));
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const i = harness.cursor++;
    if (!(i in harness.slots)) harness.slots[i] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [harness.slots[i] as T, (value: T) => { harness.slots[i] = value; }] as const;
  }
  return { ...react, useState: state, useRef: <T,>(initial: T) => state({ current: initial })[0], useTransition: () => [harness.pending, (job: () => Promise<void>) => { harness.pending = true; harness.jobs.push(job().finally(() => { harness.pending = false; })); }] };
});
vi.mock("../app/admin/questions/actions", () => ({ saveHostFaq: harness.save }));
vi.mock("../components/admin/host-event-context", () => ({ useHostEvent: () => ({ contentLive: false, args: ["event-owned"] }) }));
import { HostFaqEditor } from "../components/admin/host-faqs-manager";
type Element = ReactElement<Record<string, unknown>>;
let props: Parameters<typeof HostFaqEditor>[0], tree: Element;
function render() { harness.cursor = 0; tree = HostFaqEditor(props); }
function find(predicate: (el: Element) => boolean, value: ReactNode = tree): Element | undefined {
  if (Array.isArray(value)) { for (const child of value) { const result = find(predicate, child); if (result) return result; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, value.props.children as ReactNode ?? null);
}
function set(name: string, value: string | boolean) { (find(el => el.props.name === name)!.props.onChange as (e: unknown) => void)({ target: { value, checked: value } }); render(); }
function submit() { (tree.props.onSubmit as (e: unknown) => void)({ preventDefault() {} }); render(); }
async function finish() { await Promise.all(harness.jobs); render(); }
beforeEach(() => { vi.resetAllMocks(); harness.slots = []; harness.jobs = []; harness.pending = false; props = { onSaved: harness.onSaved, onCancel: harness.onCancel }; harness.save.mockResolvedValue({ ok: true }); render(); });
describe("FAQ editing interactions", () => {
  it("submits an explicit private choice and forwards the owned event", async () => {
    set("question", "Parking?"); set("answer", "Driveway"); submit(); await finish();
    expect(harness.save).toHaveBeenCalledWith(expect.any(String), 0, { question: "Parking?", answer: "Driveway", isPublished: false }, "event-owned");
    expect(harness.onSaved).toHaveBeenCalledWith(false);
  });
  it("locks rapid clicks and shows a disabled form until the save completes", async () => {
    let resolve!: (value: unknown) => void; harness.save.mockReturnValue(new Promise(done => { resolve = done; }));
    submit(); submit(); expect(harness.save).toHaveBeenCalledTimes(1);
    expect(find(el => el.type === "fieldset")?.props.disabled).toBe(true);
    expect(find(el => el.props.type === "submit")?.props.children).toBe("Saving…");
    resolve({ ok: true }); await finish(); expect(harness.onSaved).toHaveBeenCalledTimes(1);
  });
  it.each(["failure", "throw"])("retains input and the same retry key on %s without false success", async mode => {
    if (mode === "throw") harness.save.mockRejectedValueOnce(Error("secret")); else harness.save.mockResolvedValueOnce({ ok: false, message: "Please retry." });
    set("question", "Kids?"); set("answer", "Welcome."); set("isPublished", true); submit(); await finish();
    expect(harness.onSaved).not.toHaveBeenCalled(); expect(find(el => el.props.role === "alert")).toBeTruthy();
    expect(find(el => el.props.name === "question")?.props.value).toBe("Kids?"); expect(find(el => el.props.name === "answer")?.props.value).toBe("Welcome.");
    const key = harness.save.mock.calls[0][0]; submit(); await finish();
    expect(harness.save.mock.calls[1][0]).toBe(key); expect(harness.onSaved).toHaveBeenCalledWith(true);
  });
  it("edits host question text and submits the original revision, including unpublication", async () => {
    props.faq = { id: "existing-id", source: "host", revision: 4, guestName: null, question: "Old", answer: "Answer", isPublished: true, createdAt: "2026-10-01T20:00:00Z" }; harness.slots = []; render();
    set("question", "New wording"); set("isPublished", false); submit(); await finish();
    expect(harness.save).toHaveBeenCalledWith("existing-id", 4, { question: "New wording", answer: "Answer", isPublished: false }, "event-owned");
  });
  it("keeps unsaved text on stale-revision failure and offers no success", async () => {
    harness.save.mockResolvedValue({ ok: false, message: "This FAQ changed. Reload this section." });
    set("answer", "Unsaved answer"); submit(); await finish();
    expect(find(el => el.props.role === "alert")?.props.children).toContain("Reload");
    expect(find(el => el.props.name === "answer")?.props.value).toBe("Unsaved answer"); expect(harness.onSaved).not.toHaveBeenCalled();
  });
  it("cancel never saves or changes visibility", () => {
    (find(el => el.props.children === "Cancel")!.props.onClick as () => void)();
    expect(harness.onCancel).toHaveBeenCalledTimes(1); expect(harness.save).not.toHaveBeenCalled();
  });
});
