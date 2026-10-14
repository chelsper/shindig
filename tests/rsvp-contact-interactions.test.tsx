import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, tasks: [] as Promise<unknown>[] }));
const actions = vi.hoisted(() => ({ submit: vi.fn(), preferences: vi.fn(), refresh: vi.fn(), cleanup: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state<T>(initial: T) { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i] as T, (value: T) => { h.slots[i] = value; }] as const; }
  return { ...react, useState: state, useRef: <T,>(value: T) => state({ current: value })[0],
    useTransition: () => [false, (callback: () => Promise<unknown>) => h.tasks.push(callback())] };
});
vi.mock("../app/actions", () => ({ submitRsvp: actions.submit }));
vi.mock("../app/e/actions", () => ({ submitEventRsvp: actions.submit, updateEventRsvp: vi.fn() }));
vi.mock("../app/rsvp/contact-actions", () => ({ updateContactPreferences: actions.preferences }));
vi.mock("../app/admin/contacts/actions", () => ({ refreshContacts: actions.refresh, cleanUpContacts: actions.cleanup }));
import { InvitationPage } from "../components/invitation-page";
import { ContactPreferencesFields } from "../components/rsvp/contact-preferences-fields";
import { ContactPreferencesForm } from "../components/rsvp/contact-preferences-form";
import { HostContactsPanel } from "../components/admin/host-contacts";
import { EMPTY_CONTACT_PREFERENCES } from "../lib/rsvp-contacts";
let tree: ReactNode;
function render(component: () => ReactNode) { h.cursor = 0; tree = component(); }
function find(predicate: (n: ReactElement<Record<string, unknown>>) => boolean, node: ReactNode = tree): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const match = find(predicate, child ?? null); if (match) return match; } }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return predicate(node) ? node : find(predicate, (node.props.children as ReactNode) ?? null);
}
function button(text: string) { return find(n => n.type === "button" && (n.props.children === text || Array.isArray(n.props.children) && n.props.children.includes(text)))!; }
function click(text: string) { return (button(text).props.onClick as () => void)(); }
function submit() { return (find(n => n.type === "form")!.props.onSubmit as (e: unknown) => void)({ preventDefault() {} }); }
const initial = { contacts: [{ guestName: "Guest A", attending: true, email: "old@example.com", phone: "+19045550123", emailConsentedAt: "2026-10-14T12:00:00Z", textConsentedAt: "2026-10-14T12:00:00Z" }], collectionClosed: false };
beforeEach(() => { h.slots = []; h.cursor = 0; h.tasks = []; vi.clearAllMocks(); vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }); });
afterEach(() => vi.unstubAllGlobals());
describe("contact preference interactions", () => {
  it("sends explicitly selected channels with RSVP and ignores rapid submit clicks", async () => {
    actions.submit.mockResolvedValue({ ok: false, message: "Synthetic save failure" });
    const page = () => InvitationPage({ persistenceDisabled: false });
    render(page); click("Attending"); render(page);
    (find(n => n.type === "input" && n.props.name === "name")!.props.onChange as (e: unknown) => void)({ target: { value: "Guest A" } });
    const fields = find(n => n.type === ContactPreferencesFields)!;
    expect(fields.props.value).toEqual(EMPTY_CONTACT_PREFERENCES);
    (fields.props.onChange as (value: unknown) => void)({ ...EMPTY_CONTACT_PREFERENCES, emailOptIn: true, email: "guest@example.com" });
    render(page); submit(); submit(); await Promise.all(h.tasks);
    expect(actions.submit).toHaveBeenCalledTimes(1);
    expect(actions.submit.mock.calls[0][0].contactPreferences).toMatchObject({ emailOptIn: true, textOptIn: false, email: "guest@example.com" });
    render(page); expect(find(n => n.props.children === "Synthetic save failure")).toBeTruthy();
    expect(find(n => n.props.children === "RSVP received")).toBeUndefined();
  });
  it("withdraws via the separate form, uses returned revision and shows no false success", async () => {
    const prefs = { ...EMPTY_CONTACT_PREFERENCES, emailOptIn: true, email: "guest@example.com", revision: 1 };
    const form = () => ContactPreferencesForm({ initial: prefs, token: "a".repeat(43), eventSlug: "event-test" });
    render(form);
    (find(n => n.type === ContactPreferencesFields)!.props.onChange as (value: unknown) => void)({ ...EMPTY_CONTACT_PREFERENCES, revision: 1 });
    actions.preferences.mockResolvedValue({ ok: true, preferences: { ...EMPTY_CONTACT_PREFERENCES, revision: 2 } });
    render(form); submit(); submit(); await Promise.all(h.tasks); render(form);
    expect(actions.preferences).toHaveBeenCalledTimes(1);
    expect(actions.preferences).toHaveBeenCalledWith("event-test", "a".repeat(43), expect.objectContaining({ emailOptIn: false, email: null, revision: 1 }));
    expect(find(n => n.type === ContactPreferencesFields)!.props.value).toMatchObject({ revision: 2 });
    actions.preferences.mockResolvedValue({ ok: false, message: "Preferences couldn’t save" });
    submit(); await Promise.all(h.tasks); render(form);
    expect(find(n => n.props.role === "status")!.props.children).toBe("Preferences couldn’t save");
  });
  it("refreshes and deduplicates contacts before copying, instead of using the initial list", async () => {
    const panel = () => HostContactsPanel({ initial, title: "Garden Supper", eventSlug: "event-test" });
    const current = { ...initial.contacts[0], email: "new@example.com" };
    actions.refresh.mockResolvedValue({ ok: true, data: { collectionClosed: false, contacts: [current, current] } });
    render(panel); click("Copy email recipients"); await Promise.all(h.tasks);
    expect(actions.refresh).toHaveBeenCalledWith("event-test");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("new@example.com");
    actions.refresh.mockResolvedValue({ ok: false, message: "Session expired" });
    render(panel); click("Copy email recipients"); await Promise.all(h.tasks); render(panel);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1); expect(find(n => n.props.role === "status")!.props.children).toBe("Session expired");
  });
  it("uses the channel and attendance selection, and provides clipboard fallback", async () => {
    actions.refresh.mockResolvedValue({ ok: true, data: initial });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("clipboard denied"));
    const panel = () => HostContactsPanel({ initial, title: "Garden Supper" });
    render(panel); click("Text"); render(panel); click("Copy text recipients"); await Promise.all(h.tasks); render(panel);
    expect(find(n => n.type === "textarea" && n.props.readOnly === true)!.props.value).toBe("+19045550123");
    (find(n => n.type === "select")!.props.onChange as (e: unknown) => void)({ target: { value: "declined" } });
    render(panel); click("Copy text recipients"); await Promise.all(h.tasks); render(panel);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1); expect(find(n => n.props.role === "status")!.props.children).toContain("No opted-in contacts");
  });
  it("requires explicit cleanup confirmation and clears rendered contacts after success", async () => {
    const panel = () => HostContactsPanel({ initial, title: "Garden Supper", eventSlug: "event-test" });
    actions.cleanup.mockResolvedValue({ ok: true });
    render(panel); expect(button("Clear event contacts").props.disabled).toBe(true);
    click("Clear event contacts"); expect(actions.cleanup).not.toHaveBeenCalled();
    (find(n => n.type === "input" && n.props.type === "checkbox")!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    render(panel); click("Clear event contacts"); await Promise.all(h.tasks); render(panel);
    expect(actions.cleanup).toHaveBeenCalledWith(true, "event-test"); expect(button("Copy email recipients")).toBeUndefined();
    expect(find(n => n.props.children === "old@example.com")).toBeUndefined();
  });
});
