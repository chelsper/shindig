import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, save: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const i = harness.cursor++;
    if (!(i in harness.slots)) harness.slots[i] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [harness.slots[i] as T, (value: T) => { harness.slots[i] = value; }] as const;
  }
  return { ...react, useState: state, useRef: <T,>(initial: T) => state({ current: initial })[0] };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }) }));
vi.mock("../app/admin/events/[id]/content/actions", () => ({ saveHubSectionVisibility: harness.save }));
import { HubSectionVisibility } from "../components/admin/hub-section-visibility";
import { hubSectionStatus } from "../lib/event-hub-content";
import { eventId } from "./fixtures/publication";
type Element = ReactElement<Record<string, unknown>>;
let props: Parameters<typeof HubSectionVisibility>[0], tree: ReactElement;
function render() { harness.cursor = 0; tree = HubSectionVisibility(props); }
function find(predicate: (el: Element) => boolean, value: ReactNode = tree): Element | undefined {
  if (Array.isArray(value)) { for (const child of value) { const result = find(predicate, child); if (result) return result; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, value.props.children as ReactNode ?? null);
}
function text(value: ReactNode = tree): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return text(value.props.children ?? null);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
const toggle = () => find(el => el.props.role === "switch")!;
async function click() { const result = (toggle().props.onClick as () => Promise<void>)(); render(); await result; render(); }
beforeEach(() => {
  vi.resetAllMocks(); harness.slots = [];
  props = { id: eventId, section: "potluck", revision: 2, enabled: false, live: false };
  harness.save.mockResolvedValue({ ok: true, revision: 3, enabled: true }); render();
});
describe("inline Hub visibility control", () => {
  it.each([[false, false, "Off"], [true, false, "Saved privately"], [true, true, "Live"], [false, true, "Live"]] as const)("labels saved=%s live=%s as %s", (enabled, live, label) => {
    expect(hubSectionStatus(enabled, live)).toBe(label);
    props = { ...props, enabled, live }; render();
    expect(text()).toContain(label); expect(toggle().props["aria-checked"]).toBe(enabled);
  });
  it("enables privately and offers explicit review without navigation or automatic publication", async () => {
    await click(); expect(harness.save).toHaveBeenCalledWith({ id: eventId, section: "potluck", revision: 2, enabled: true });
    expect(toggle().props["aria-checked"]).toBe(true); expect(text()).toContain("Nothing has been published");
    expect(text()).toContain("all saved event changes, not just this section");
    expect(find(el => el.props.href === `/admin/events/${eventId}/publish`)).toBeTruthy();
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    harness.save.mockResolvedValue({ ok: true, revision: 4, enabled: false }); await click();
    expect(harness.save.mock.lastCall?.[0].revision).toBe(3);
  });
  it("continues to identify a live section as live after saving an off switch", async () => {
    props = { ...props, enabled: true, live: true }; harness.save.mockResolvedValue({ ok: true, revision: 3, enabled: false }); render();
    await click(); expect(text()).toContain("still live"); expect(text()).toContain("Off after publishing");
    expect(text()).toContain("content edits still take effect"); expect(text()).not.toContain("This section is private");
  });
  it("blocks rapid repeated clicks and uses the newest server revision after refresh", async () => {
    let finish!: (value: unknown) => void; harness.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = click(), second = click(); expect(harness.save).toHaveBeenCalledTimes(1); expect(toggle().props.disabled).toBe(true);
    finish({ ok: true, enabled: true, revision: 3 }); await Promise.all([first, second]);
    props = { ...props, revision: 4, enabled: false }; render();
    expect(toggle().props["aria-checked"]).toBe(false);
    harness.save.mockResolvedValue({ ok: true, revision: 5, enabled: true }); await click();
    expect(harness.save.mock.lastCall?.[0].revision).toBe(4);
  });
  it.each(["failure", "throw", "conflict"])("does not show false success on %s and keeps the saved switch unchanged", async kind => {
    if (kind === "throw") harness.save.mockRejectedValue(Error("secret"));
    else harness.save.mockResolvedValue({ ok: false, message: "Please reload.", conflict: kind === "conflict" });
    await click(); expect(toggle().props["aria-checked"]).toBe(false); expect(text()).not.toContain("Enabled in your saved setup");
    expect(find(el => el.props.role === "alert")).toBeTruthy(); expect(text()).not.toContain("secret");
    expect(harness.refresh).not.toHaveBeenCalled();
    if (kind === "conflict") { await click(); expect(harness.save).toHaveBeenCalledTimes(1); expect(toggle().props.disabled).toBe(true); }
  });
  it("explains archived events must be restored before publication", () => {
    props = { ...props, enabled: true, archived: true }; render(); expect(text()).toContain("Restore & review"); expect(text()).toContain("event is archived");
  });
});
