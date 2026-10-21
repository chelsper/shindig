import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pending: false }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: <T,>(initial: T) => {
    const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial;
    return [h.slots[i] as T, (value: T) => { h.slots[i] = value; }] as const;
  }, useActionState: () => [{ error: null }, vi.fn(), h.pending] };
});
vi.mock("../app/admin/actions", () => ({ createAdminGuest: vi.fn(), updateAdminGuest: vi.fn(), deleteAdminGuest: vi.fn() }));
vi.mock("../app/admin/events/[id]/guests/actions", () => ({ createEventGuest: vi.fn(), updateEventGuest: vi.fn(), deleteEventGuest: vi.fn() }));
import { AdminGuestForm } from "../components/admin/admin-guest-form";
import { EventSetupNavigation } from "../components/admin/event-setup-navigation";
import { EventGuestsNavigation } from "../components/admin/event-guests-navigation";
import { eventId, otherEventId, eventSlug } from "./fixtures/publication";
const event = { id: eventId, title: "Garden Supper", maxPartySize: 4, guestListDefaultVisible: false, guestListEnabled: false, requestId: otherEventId };
const guest = { id: otherEventId, eventSlug, guestName: "Example", attending: true, partySize: 8, displayOnGuestList: false, comment: null, createdAt: "2026-10-20T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z" };
let tree: ReactNode;
function render(edit = false) { h.cursor = 0; tree = edit ? AdminGuestForm({ mode: "edit", event, rsvp: guest }) : AdminGuestForm({ mode: "create", event }); }
function find(predicate: (element: ReactElement<Record<string, unknown>>) => boolean, node: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const match = find(predicate, child ?? null); if (match) return match; } }
  if (isValidElement<Record<string, unknown>>(node)) return predicate(node) ? node : find(predicate, (node.props.children as ReactNode) ?? null);
}
function navigate(type: typeof EventSetupNavigation | typeof EventGuestsNavigation) {
  const click = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  (find(n => n.type === type)!.props.onNavigate as (e: typeof click) => void)(click);
  return click.defaultPrevented;
}
beforeEach(() => { h.slots = []; h.pending = false; vi.stubGlobal("window", { confirm: vi.fn(() => false) }); });
afterEach(() => vi.unstubAllGlobals());
describe("RSVP workspace leave guards", () => {
  it("allows clean navigation, even when a historical party size needs correction", () => {
    render(true);
    expect(navigate(EventSetupNavigation)).toBe(false); expect(navigate(EventGuestsNavigation)).toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it("requires confirmation before discarding an unsaved guest change from either navigation", () => {
    render();
    (find(n => n.props.name === "guestName")!.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "New guest" } }); render();
    for (const type of [EventSetupNavigation, EventGuestsNavigation]) expect(navigate(type)).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith("Leave without saving this RSVP?");
    vi.mocked(window.confirm).mockReturnValue(true); expect(navigate(EventSetupNavigation)).toBe(false);
  });
  it("blocks both navigation levels during an in-flight save", () => {
    h.pending = true; render();
    expect(navigate(EventSetupNavigation)).toBe(true); expect(navigate(EventGuestsNavigation)).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
