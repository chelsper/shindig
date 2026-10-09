import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
// Real form handlers with deterministic hooks; browser QA covers DOM/layout.
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, tasks: [] as Promise<void>[], save: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  function state<T>(initial: T | (() => T)) {
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [h.slots[index] as T, (value: T) => { h.slots[index] = value; }] as const;
  }
  return { ...react, useState: state, useRef: <T,>(initial: T) => state(() => ({ current: initial }))[0], useTransition: () => {
    const [pending, setPending] = state(false);
    return [pending, (task: () => Promise<void>) => { setPending(true); h.tasks.push(task().finally(() => setPending(false))); }];
  } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock("../app/event/potluck-actions", () => ({ saveGuestPotluckClaim: h.save }));
import { PotluckModule } from "../components/event-hub/potluck-module";
import { PotluckClaimEditor } from "../components/potluck/claim-editor";
import { publicationEvent } from "../lib/event-publication";
import { eventId, snapshot } from "./fixtures/publication";
const key = "5199b7de-d731-4bb1-8e55-3380e2f0e365", token = "a".repeat(43);
const item = { key, title: "Ice", note: "", needed: 5, claimed: 0 };
const claim = { itemKey: key, title: "Ice", guestName: "Alex", quantity: 2, revision: 1, archived: false };
const event = publicationEvent(eventId, snapshot);
let tree: ReactElement, edit = false;
function render() { h.cursor = 0; tree = edit ? PotluckClaimEditor({ event, initial: claim, token }) : PotluckModule({ items: [item], eventSlug: event.slug }); }
function find(predicate: (node: ReactElement<Record<string, unknown>>) => boolean, value: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) { for (const child of value) { const found = find(predicate, child ?? null); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(value)) return;
  return predicate(value) ? value : find(predicate, (value.props.children as ReactNode) ?? null);
}
function click(text: string) { const node = find(n => n.type === "button" && n.props.children === text)!; (node.props.onClick as () => void)(); render(); }
function change(type: string | undefined, value: string | boolean) {
  const node = find(n => n.type === "input" && n.props.type === type)!;
  (node.props.onChange as (event: unknown) => void)({ target: { value, checked: value } }); render();
}
function submit() { (find(n => n.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); render(); }
beforeEach(() => { h.slots = []; h.cursor = 0; h.tasks = []; vi.resetAllMocks(); edit = false; h.save.mockResolvedValue({ ok: true, data: claim }); render(); });
describe("bring-something guest interactions", () => {
  it("locks repeated submissions, then returns a private link and refreshes counts", async () => {
    let resolve!: (value: unknown) => void; h.save.mockReturnValue(new Promise(done => { resolve = done; }));
    click("I’ll bring this"); change(undefined, "Alex"); change("number", "2"); submit(); submit();
    expect(h.save).toHaveBeenCalledTimes(1); expect(find(n => n.type === "fieldset")?.props.disabled).toBe(true);
    const data = h.save.mock.lastCall![1]; expect(data).toMatchObject({ guestName: "Alex", quantity: 2, revision: 0 }); expect(data.editToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    resolve({ ok: true, data: claim }); await Promise.all(h.tasks); render();
    expect(find(n => n.props.href === `/e/${event.slug}/bring/${data.editToken}`)).toBeTruthy();
    expect(find(n => n.props.role === "status")).toBeTruthy(); expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("retains details and the same retry token after failure (throws=%s)", async throws => {
    if (throws) h.save.mockRejectedValue(new Error("private database detail")); else h.save.mockResolvedValue({ ok: false, message: "Please try again." });
    click("I’ll bring this"); change(undefined, "Alex"); submit(); await Promise.all(h.tasks); render();
    const first = h.save.mock.lastCall![1]; expect(find(n => n.props.role === "status")).toBeUndefined(); expect(find(n => n.props.role === "alert")).toBeTruthy();
    expect(find(n => n.type === "input" && n.props.autoComplete === "name")?.props.value).toBe("Alex");
    submit(); await Promise.all(h.tasks); expect(h.save.mock.lastCall![1].editToken).toBe(first.editToken);
  });
  it("updates only through the private token and advances revision for cancellation", async () => {
    h.slots = []; edit = true; render(); change("number", "3");
    h.save.mockResolvedValue({ ok: true, data: { ...claim, quantity: 3, revision: 2 } }); submit(); submit(); await Promise.all(h.tasks); render();
    expect(h.save).toHaveBeenCalledTimes(1); expect(h.save).toHaveBeenLastCalledWith("update", expect.objectContaining({ editToken: token, quantity: 3, revision: 1 }), event.slug);
    expect(find(n => n.type === "button" && n.props.children === "Cancel my signup")?.props.disabled).toBe(true);
    change("checkbox", true); h.save.mockResolvedValue({ ok: true, data: { ...claim, quantity: 0, revision: 3 } }); click("Cancel my signup"); await Promise.all(h.tasks); render();
    expect(h.save).toHaveBeenLastCalledWith("cancel", expect.objectContaining({ editToken: token, revision: 2 }), event.slug);
    expect(find(n => n.type === "button" && n.props.children === "Sign up again")).toBeTruthy(); expect(find(n => n.props.role === "status")).toBeTruthy();
  });
  it("does not show an update success when the server rejects it", async () => {
    h.slots = []; edit = true; render(); h.save.mockResolvedValue({ ok: false, message: "Those spots are covered." }); submit(); await Promise.all(h.tasks); render();
    expect(find(n => n.props.role === "alert")).toBeTruthy(); expect(find(n => n.props.role === "status")).toBeUndefined();
  });
});
