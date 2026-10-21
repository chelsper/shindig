import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, tasks: [] as Promise<unknown>[], pending: false }));
const actions = vi.hoisted(() => ({ change: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state<T>(initial: T) { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i] as T, (value: T) => { h.slots[i] = value; }] as const; }
  return { ...react, useState: state, useRef: <T,>(value: T) => state({ current: value })[0], useTransition: () => [h.pending, (callback: () => Promise<unknown>) => h.tasks.push(callback())] };
});
vi.mock("../app/admin/invitations/actions", () => ({ changeInvitation: actions.change, refreshInvitationTracker: actions.refresh }));
import { InvitationTrackerPanel } from "../components/admin/invitation-tracker";
import { MatchInvitee } from "../components/admin/invitation-match-picker";
import { InviteeEditor } from "../components/admin/invitation-entry-editor";
import { EventSetupNavigation } from "../components/admin/event-setup-navigation";
import { EventGuestsNavigation } from "../components/admin/event-guests-navigation";
import type { InvitationTracker, Invitee } from "../lib/invitation-tracker";
const entry: Invitee = { id: "af4506d7-215a-4d08-9b39-f6c380f4a8f4", revision: 1, guestName: "Household", email: "host-entered@example.test", phone: null, invited: false, response: null };
const response = { id: "bf4506d7-215a-4d08-9b39-f6c380f4a8f4", guestName: "RSVP name", attending: true, partySize: 2 };
const initial: InvitationTracker = { invitees: [entry], responses: [response] };
const props = { initial, title: "Garden Supper", eventSlug: "event-test", invitationUrl: "https://www.haveashindig.com/e/garden" };
let tree: ReactNode;
function render(component: () => ReactNode = () => InvitationTrackerPanel(props)) { h.cursor = 0; tree = component(); }
function find(predicate: (n: ReactElement<Record<string, unknown>>) => boolean, node: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) for (const child of node) { const match = find(predicate, child ?? null); if (match) return match; }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return predicate(node) ? node : find(predicate, (node.props.children as ReactNode) ?? null);
}
function button(text: string) { return find(n => n.type === "button" && n.props.children === text)!; }
function click(text: string) { return (button(text).props.onClick as () => void)(); }
function change(node: ReactElement<Record<string, unknown>>, value: unknown, checked = false) { (node.props.onChange as (e: unknown) => void)({ target: checked ? { checked: value } : { value } }); }
beforeEach(() => { h.slots = []; h.cursor = 0; h.tasks = []; h.pending = false; vi.clearAllMocks(); vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }); actions.change.mockResolvedValue({ ok: true, data: initial }); actions.refresh.mockResolvedValue({ ok: true, data: initial }); });
afterEach(() => vi.unstubAllGlobals());

describe("private tracker interactions", () => {
  it("saves and opens a fresh household only after confirmation, clearing contact and sent fields", async () => {
    render(); click("+ Add invitee"); render();
    const editor = find(n => n.type === InviteeEditor)!;
    const originalId = (editor.props.entry as Invitee).id;
    (editor.props.onSave as (value: unknown, another: boolean) => void)({ kind: "save", id: originalId, revision: 0, guestName: "New family", email: "test@example.test", phone: "+19045550123", invited: true }, true);
    await Promise.all(h.tasks); render();
    const next = find(n => n.type === InviteeEditor)!.props.entry as Invitee;
    expect(next).toMatchObject({ revision: 0, guestName: "", email: null, phone: null, invited: false });
    expect(next.id).not.toBe(originalId); expect(actions.change).toHaveBeenCalledTimes(1);
  });
  it("retains the same entry ID and editor when Save & add another fails", async () => {
    actions.change.mockResolvedValue({ ok: false, message: "Please retry" });
    render(); click("+ Add invitee"); render();
    const editor = find(n => n.type === InviteeEditor)!;
    (editor.props.onSave as (value: unknown, another: boolean) => void)({ ...(editor.props.entry as Invitee), kind: "save", guestName: "Family" }, true);
    await Promise.all(h.tasks); render();
    expect(find(n => n.type === InviteeEditor)!.props.entry).toEqual(editor.props.entry);
    expect(find(n => n.props.role === "status")!.props.children).toBe("Please retry");
  });
  it("uses the submitter for add-another intent; ordinary Enter saves and closes", () => {
    const onSave = vi.fn(), form = () => InviteeEditor({ entry: { ...entry, revision: 0 }, pending: false, onSave, onCancel: vi.fn() });
    render(form);
    const submit = find(n => n.type === "form")!.props.onSubmit as (e: unknown) => void;
    submit({ preventDefault() {}, nativeEvent: { submitter: { getAttribute: () => "another" } } });
    expect(onSave.mock.calls[0][1]).toBe(true);
    submit({ preventDefault() {}, nativeEvent: { submitter: null } });
    expect(onSave.mock.calls[1][1]).toBe(false);
  });
  it("requires selection and confirmation for bulk marking, and blocks duplicate rapid clicks", async () => {
    render(); expect(button("Mark selected as invited")).toBeUndefined();
    change(find(n => n.props["aria-label"] === "Select Household to mark invited")!, true, true); render();
    click("Mark selected as invited"); render(); expect(actions.change).not.toHaveBeenCalled();
    click("Yes, I’ve sent these invitations"); click("Yes, I’ve sent these invitations");
    await Promise.all(h.tasks); render();
    expect(actions.change).toHaveBeenCalledTimes(1);
    expect(actions.change).toHaveBeenCalledWith({ kind: "sent-many", entries: [{ id: entry.id, revision: 1 }], confirmed: true }, "event-test");
    expect(button("Mark selected as invited")).toBeUndefined();
  });
  it("clears selected entries when changing filters, so hidden rows cannot be marked", () => {
    render(); change(find(n => n.props["aria-label"] === "Select Household to mark invited")!, true, true); render();
    click("Waiting for RSVP"); render(); expect(button("Mark selected as invited")).toBeUndefined();
    click("All"); render(); expect(find(n => n.props["aria-label"] === "Select Household to mark invited")!.props.checked).toBe(false);
  });
  it("retains selection and reports failure without claiming bulk success", async () => {
    actions.change.mockResolvedValue({ ok: false, message: "Nothing was marked. Refresh." });
    render(); change(find(n => n.props["aria-label"] === "Select Household to mark invited")!, true, true); render();
    click("Mark selected as invited"); render(); click("Yes, I’ve sent these invitations"); await Promise.all(h.tasks); render();
    expect(find(n => n.type === "p" && n.props.role === "status")!.props.children).toBe("Nothing was marked. Refresh.");
    expect(button("Yes, I’ve sent these invitations")).toBeTruthy(); expect(button("Mark invited")).toBeTruthy();
  });
  it("opens a host-confirmed reverse match from an unmatched response, without guessing", () => {
    render(() => InvitationTrackerPanel({ ...props, initialResponseId: response.id }));
    expect(find(n => n.type === MatchInvitee)!.props.response).toEqual(response);
    expect(actions.change).not.toHaveBeenCalled();
    h.slots = []; const onSave = vi.fn(), form = () => MatchInvitee({ response, data: initial, pending: false, onSave, onCancel: vi.fn() });
    render(form); expect(button("Confirm RSVP match").props.disabled).toBe(true);
    (find(n => typeof n.type === "function" && n.type.name === "MatchChoices")!.props.onSelect as (id: string) => void)(entry.id); render(form);
    expect(button("Confirm RSVP match").props.disabled).toBe(true);
    (find(n => typeof n.type === "function" && n.type.name === "Confirmation")!.props.onChange as (value: boolean) => void)(true); render(form); click("Confirm RSVP match");
    expect(onSave).toHaveBeenCalledWith({ kind: "link", id: entry.id, revision: 1, rsvpId: response.id, confirmed: true });
  });
  it("shows a direct existing-entry link for matched responses and ignores unknown response IDs", () => {
    render(); expect(find(n => n.type === "a" && n.props.href === `#invitee-${entry.id}`)).toBeUndefined();
    h.slots = [];
    render(() => InvitationTrackerPanel({ ...props, initialResponseId: response.id, initial: { ...initial, invitees: [{ ...entry, response }] } }));
    expect(find(n => n.type === MatchInvitee)).toBeUndefined(); expect(find(n => n.type === "a" && n.props.href === `#invitee-${entry.id}`)).toBeTruthy();
    h.slots = []; render(() => InvitationTrackerPanel({ ...props, initialResponseId: "foreign" }));
    expect(find(n => n.type === MatchInvitee)).toBeUndefined(); expect(actions.change).not.toHaveBeenCalled();
  });
  it("guards both workspace navigation levels while editing or saving an invitation", async () => {
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
    const workspace = { id: entry.id, publishedBefore: true };
    const component = () => InvitationTrackerPanel({ ...props, workspace });
    const navigate = (type: typeof EventSetupNavigation | typeof EventGuestsNavigation) => {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      (find(n => n.type === type)!.props.onNavigate as (e: typeof event) => void)(event);
      return event.defaultPrevented;
    };
    render(component);
    expect(navigate(EventSetupNavigation)).toBe(false);
    click("+ Add invitee"); render(component);
    for (const type of [EventSetupNavigation, EventGuestsNavigation]) expect(navigate(type)).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith("Leave without finishing this invitation entry?");
    vi.mocked(window.confirm).mockReturnValue(true);
    expect(navigate(EventSetupNavigation)).toBe(false);
    // Fresh panel; pending mutations must block navigation without a confirmation.
    h.slots = []; render(component); vi.mocked(window.confirm).mockClear();
    let finish!: (value: unknown) => void;
    actions.change.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    click("Mark invited"); render(component);
    expect(navigate(EventSetupNavigation)).toBe(true); expect(navigate(EventGuestsNavigation)).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
    finish({ ok: true, data: initial }); await Promise.all(h.tasks); render(component);
    expect(navigate(EventSetupNavigation)).toBe(false);
  });
  it("ignores rapid repeated status clicks, disables controls in flight and uses saved data", async () => {
    actions.change.mockResolvedValue({ ok: true, data: { ...initial, invitees: [{ ...entry, invited: true, revision: 2 }] } });
    render(); click("Mark invited"); click("Mark invited");
    h.pending = true; render(); expect(button("Mark invited").props.disabled).toBe(true); expect(button("+ Add invitee").props.disabled).toBe(true);
    await Promise.all(h.tasks); h.pending = false; render();
    expect(actions.change).toHaveBeenCalledTimes(1);
    expect(actions.change).toHaveBeenCalledWith({ kind: "sent", id: entry.id, revision: 1, invited: true }, "event-test");
    expect(button("Mark not sent")).toBeTruthy();
    expect(find(n => n.props.role === "status")!.props.children).toContain("Nothing was sent");
  });
  it("keeps current entries and reports failure instead of claiming success", async () => {
    actions.change.mockResolvedValue({ ok: false, message: "Session expired. Please sign in again." });
    render(); click("Mark invited"); await Promise.all(h.tasks); render();
    expect(button("Mark invited")).toBeTruthy(); expect(find(n => n.props.role === "status")!.props.children).toContain("Session expired");
  });
  it("copies a link/reminder without sending, changing status, or copying private contacts", async () => {
    render(); await click("Copy invitation link"); await click("Copy reminder message");
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(1, props.invitationUrl);
    const text = vi.mocked(navigator.clipboard.writeText).mock.calls[1][0];
    expect(text).toContain("Garden Supper"); expect(text).toContain(props.invitationUrl); expect(text).not.toContain(entry.email);
    expect(actions.change).not.toHaveBeenCalled(); render(); expect(button("Mark invited")).toBeTruthy();
  });
  it("offers selectable copy text when clipboard access is blocked", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    render(); await click("Copy invitation link"); render();
    expect(find(n => n.type === "textarea" && n.props.readOnly === true)!.props.value).toBe(props.invitationUrl);
  });
  it("gates removal behind explicit confirmation and does not delete on opening", async () => {
    actions.change.mockResolvedValue({ ok: true, data: { ...initial, invitees: [] } });
    render(); click("Remove"); render(); expect(actions.change).not.toHaveBeenCalled();
    click("Yes, remove invitee"); await Promise.all(h.tasks); render();
    expect(actions.change).toHaveBeenCalledWith({ kind: "remove", id: entry.id, revision: 1, confirmed: true }, "event-test");
    expect(button("Mark invited")).toBeUndefined(); expect(find(n => n.props.role === "status")!.props.children).toContain("RSVPs and guest opt-ins are unchanged");
  });
  it("keeps a new-entry ID across failed saves so retrying cannot create another row", async () => {
    render(); click("+ Add invitee"); render();
    const editor = find(n => typeof n.type === "function" && n.type.name === "InviteeEditor")!;
    const newEntry = editor.props.entry as Invitee;
    expect(newEntry.revision).toBe(0);
    actions.change.mockResolvedValue({ ok: false, message: "Refresh before retrying" });
    const payload = { ...newEntry, kind: "save", guestName: "New household" };
    (editor.props.onSave as (value: unknown) => void)(payload); await Promise.all(h.tasks); render();
    const retained = find(n => typeof n.type === "function" && n.type.name === "InviteeEditor")!;
    expect((retained.props.entry as Invitee).id).toBe(newEntry.id);
    (retained.props.onSave as (value: unknown) => void)(payload); await Promise.all(h.tasks);
    expect(actions.change.mock.calls[0][0].id).toBe(actions.change.mock.calls[1][0].id);
  });
  it("does not match an RSVP until selection and confirmation, resetting consent on another selection", () => {
    render(); click("Link RSVP"); render();
    const child = find(n => typeof n.type === "function" && n.type.name === "MatchResponse")!;
    const saved = vi.fn();
    const form = () => (child.type as (props: Record<string, unknown>) => ReactNode)({ ...child.props, onSave: saved });
    h.slots = []; render(form); expect(button("Confirm RSVP match").props.disabled).toBe(true);
    (find(n => typeof n.type === "function" && n.type.name === "MatchChoices")!.props.onSelect as (id: string) => void)(response.id); render(form);
    expect(button("Confirm RSVP match").props.disabled).toBe(true);
    click("Confirm RSVP match"); expect(saved).not.toHaveBeenCalled();
    (find(n => typeof n.type === "function" && n.type.name === "Confirmation")!.props.onChange as (value: boolean) => void)(true); render(form);
    expect(button("Confirm RSVP match").props.disabled).toBe(false); click("Confirm RSVP match");
    expect(saved).toHaveBeenCalledWith({ kind: "link", id: entry.id, revision: 1, rsvpId: response.id, confirmed: true });
    (find(n => typeof n.type === "function" && n.type.name === "MatchChoices")!.props.onSelect as (id: string) => void)(""); render(form); expect(button("Confirm RSVP match").props.disabled).toBe(true);
  });
  it("refreshes rather than guessing that an existing RSVP belongs to an invitee", async () => {
    render(); click("Refresh tracker"); await Promise.all(h.tasks); render();
    expect(actions.refresh).toHaveBeenCalledWith("event-test"); expect(actions.change).not.toHaveBeenCalled(); expect(button("Link RSVP")).toBeTruthy();
  });
});
