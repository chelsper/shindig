import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, remove: vi.fn(), cleanup: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: <T,>(initial: T) => {
    const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial;
    return [h.slots[i] as T, (value: T) => { h.slots[i] = value; }] as const;
  }, useRef: <T,>(initial: T) => {
    const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i] as { current: T };
  } };
});
vi.mock("../app/admin/events/[id]/privacy/actions", () => ({ deleteEvent: h.remove, finishArtworkCleanup: h.cleanup }));
import { EventDeletionControls } from "../components/admin/event-deletion-controls";
import { eventId } from "./fixtures/publication";
const review = { id: eventId, title: "Garden Supper", details: 1, artwork: 1, settings: 1, publication: 1, visibility: "published" as const };
const receipt = { id: eventId, deletedAt: "2026-10-27T14:00:00Z", artworkCleanedAt: null, cleanupReady: false };
let tree: ReactNode;
function render() { h.cursor = 0; tree = EventDeletionControls({ review, initialReceipt: null }); }
function find(predicate: (node: ReactElement<Record<string, unknown>>) => boolean, node: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child ?? null); if (found) return found; } }
  if (isValidElement<Record<string, unknown>>(node)) return predicate(node) ? node : find(predicate, (node.props.children as ReactNode) ?? null);
}
function change(selector: (node: ReactElement<Record<string, unknown>>) => boolean, target: object) {
  (find(selector)!.props.onChange as (event: object) => void)({ target }); render();
}
function confirm() { change(n => n.props.type === "checkbox", { checked: true }); change(n => n.props.pattern === "DELETE", { value: "DELETE" }); }
function submit() { return (find(n => n.type === "form")!.props.onSubmit as (e: object) => Promise<void>)({ preventDefault: vi.fn() }); }
function text(node: ReactNode = tree): string {
  if (Array.isArray(node)) return node.map(child => text(child ?? null)).join("");
  if (isValidElement<Record<string, unknown>>(node)) return text((node.props.children as ReactNode) ?? null);
  return typeof node === "string" ? node : "";
}
beforeEach(() => { h.slots = []; h.remove.mockReset().mockResolvedValue({ ok: true, receipt }); h.cleanup.mockReset().mockResolvedValue({ ok: true, receipt }); render(); });
describe("event deletion confirmation interactions", () => {
  it("requires both acknowledgement and the exact phrase, even on direct form submission", async () => {
    expect(find(n => n.type === "button")!.props.disabled).toBe(true); await submit(); expect(h.remove).not.toHaveBeenCalled();
    change(n => n.props.type === "checkbox", { checked: true });
    change(n => n.props.pattern === "DELETE", { value: "delete" }); await submit(); expect(h.remove).not.toHaveBeenCalled();
    change(n => n.props.pattern === "DELETE", { value: "DELETE" }); expect(find(n => n.type === "button")!.props.disabled).toBe(false);
    await submit(); expect(h.remove).toHaveBeenCalledWith({ ...review, phrase: "DELETE", confirmed: true });
  });
  it("blocks repeated clicks synchronously and shows busy state until the verified result", async () => {
    let finish!: (value: object) => void; h.remove.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    confirm(); const pending = submit(); await submit(); render();
    expect(h.remove).toHaveBeenCalledTimes(1); expect(text()).toContain("Deleting event…");
    expect(find(n => n.type === "form")!.props["aria-busy"]).toBe(true);
    expect(find(n => n.props.type === "checkbox")!.props.disabled).toBe(true);
    finish({ ok: true, receipt }); await pending; render();
    expect(text()).toContain("Event records deleted"); expect(text()).toContain("cleanup is still pending"); expect(text()).not.toContain("Type DELETE");
  });
  it("does not display a false success for failed or uncertain deletion and permits a deliberate retry", async () => {
    h.remove.mockRejectedValueOnce(new Error("Lost connection")); confirm(); await submit(); render();
    expect(find(n => n.props.role === "alert")).toBeDefined(); expect(text()).not.toContain("Event records deleted");
    h.remove.mockResolvedValueOnce({ ok: false, message: "Changed since review; refresh." }); await submit(); render();
    expect(text()).toContain("Changed since review"); expect(text()).not.toContain("Event records deleted");
    await submit(); render(); expect(text()).toContain("Event records deleted");
  });
  it("keeps cleanup retryable and guarded until artwork is confirmed removed", async () => {
    confirm(); await submit(); render();
    let finish!: (value: object) => void; h.cleanup.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = submit(); await submit(); render(); expect(h.cleanup).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Checking artwork…"); finish({ ok: false, message: "Please retry cleanup." }); await pending; render();
    expect(text()).toContain("Please retry cleanup"); expect(text()).not.toContain("cleanup is complete");
    h.cleanup.mockResolvedValueOnce({ ok: true, receipt: { ...receipt, artworkCleanedAt: "2026-10-27T15:00:00Z" } });
    await submit(); render(); expect(text()).toContain("cleanup is complete"); expect(find(n => n.type === "form")).toBeUndefined();
  });
});
