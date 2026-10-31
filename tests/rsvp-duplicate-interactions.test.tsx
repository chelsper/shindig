import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, save: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state<T>(initial: T) { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i] as T, (value: T) => { h.slots[i] = value; }] as const; }
  return { ...react, useState: state, useRef: <T,>(initial: T) => state({ current: initial })[0] };
});
vi.mock("../app/admin/guests/duplicates/actions", () => ({ reviewDuplicateRsvp: h.save, refreshDuplicateReview: h.refresh }));
import { DuplicateRsvpPanel } from "../components/admin/duplicate-rsvp-panel";
import { findDuplicatePairs } from "../lib/rsvp-duplicates";
const first = { id: "00000000-0000-4000-8000-000000000001", guestName: "Sample Guest", attending: true, partySize: 2, displayOnGuestList: false, comment: null, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", version: "a".repeat(32) };
const second = { ...first, id: "00000000-0000-4000-8000-000000000002", attending: false, partySize: null, updatedAt: "2026-10-02T12:00:00Z", version: "b".repeat(32) };
const initial = findDuplicatePairs([first, second]);
let tree: ReactNode;
function render() { h.cursor = 0; tree = DuplicateRsvpPanel({ initial, timeZone: "UTC", slug: "event-test", guestsHref: "/admin/events/test/guests" }); }
type Element = ReactElement<Record<string, unknown>>;
function find(predicate: (e: Element) => boolean, value: ReactNode = tree): Element | undefined {
  if (Array.isArray(value)) { for (const child of value) { const found = find(predicate, child); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, (value.props.children as ReactNode) ?? null);
}
function text(value: ReactNode = tree): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return text(value.props.children ?? null);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function button(label: string) { return find(e => e.type === "button" && text(e.props.children as ReactNode) === label)!; }
function click(label: string) { return (button(label).props.onClick as () => void | Promise<void>)(); }
beforeEach(() => { vi.resetAllMocks(); h.slots = []; h.save.mockResolvedValue({ ok: true, data: { pairs: [], total: 0 }, message: "Merged." }); h.refresh.mockResolvedValue({ ok: true, data: initial }); render(); });
describe("duplicate review confirmation", () => {
  it("never merges on the first click and explains link/contact consequences", () => {
    click("Merge and use latest response"); render();
    expect(h.save).not.toHaveBeenCalled(); expect(text()).toContain("permanently removes the older RSVP"); expect(text()).toContain("update link stops working");
    expect(text()).toContain("opt-ins are cleared"); expect(button("Confirm merge · use latest response")).toBeTruthy();
    click("Cancel"); render(); expect(button("Confirm merge · use latest response")).toBeUndefined(); expect(h.save).not.toHaveBeenCalled();
  });
  it("sends reviewed IDs/versions after confirmation, ignores rapid clicks and disables controls", async () => {
    let finish!: (v: unknown) => void; h.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    click("Merge and use latest response"); render();
    const handler = button("Confirm merge · use latest response").props.onClick as () => Promise<void>;
    const a = handler(), b = handler(); render();
    expect(h.save).toHaveBeenCalledTimes(1); expect(button("Refresh review").props.disabled).toBe(true);
    expect(h.save).toHaveBeenCalledWith({ action: "merge", olderId: first.id, latestId: second.id, olderVersion: first.version, latestVersion: second.version, confirmed: true }, "event-test");
    finish({ ok: true, data: { pairs: [], total: 0 }, message: "Merged." }); await Promise.all([a,b]); render();
    expect(text()).toContain("Merged."); expect(text()).toContain("No possible duplicates");
  });
  it("keeps separate without requesting a merge", async () => {
    await click("Keep separate"); render(); expect(h.save.mock.calls[0][0]).toMatchObject({ action: "separate", confirmed: false });
  });
  it.each(["failure", "throw"])("shows retry errors without false success on %s", async mode => {
    if (mode === "throw") h.save.mockRejectedValue(new Error("secret database data"));
    else h.save.mockResolvedValue({ ok: false, message: "Records changed. Refresh." });
    click("Merge and use latest response"); render(); await click("Confirm merge · use latest response"); render();
    expect(find(e => e.props.role === "alert")).toBeTruthy(); expect(find(e => e.props.role === "status")).toBeUndefined();
    expect(text()).not.toContain("secret database data"); expect(text()).not.toContain("No possible duplicates");
    await click("Refresh review"); render(); expect(button("Confirm merge · use latest response")).toBeUndefined();
  });
});
