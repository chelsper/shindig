import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), artwork: vi.fn(), get: vi.fn(), save: vi.fn(), publication: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("../lib/server/event-publications", () => ({ getHostEventPublication: mocks.publication }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.get, saveDraftSettingsRecord: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
import { saveDraftSettings } from "../app/admin/events/[id]/settings/actions";
import SettingsPage, { metadata } from "../app/admin/events/[id]/settings/page";
import { EventDraftSettingsEditor } from "../components/admin/event-draft-settings-editor";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { EMPTY_EVENT_DRAFT } from "../lib/event-drafts";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const draft = { ...EMPTY_EVENT_DRAFT, title: "Private party", id, status: "draft" as const, revision: 1, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
const context = { params: Promise.resolve({ id }) };
const input = { id, revision: 0, settings: DEFAULT_DRAFT_SETTINGS };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft); mocks.artwork.mockResolvedValue({ settings: EMPTY_DRAFT_ARTWORK, revision: 0 }); mocks.get.mockResolvedValue({ settings: DEFAULT_DRAFT_SETTINGS, revision: 0 }); mocks.save.mockResolvedValue(1);
  mocks.publication.mockResolvedValue(null);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("private draft settings page and server action", () => {
  it("renders optional controls off by default and populated in the event timezone", () => {
    const props = { draft: { ...draft, timeZone: "America/New_York" }, artwork: EMPTY_DRAFT_ARTWORK };
    let html = renderToStaticMarkup(<EventDraftSettingsEditor {...props} initial={{ settings: DEFAULT_DRAFT_SETTINGS, revision: 1 }} />);
    expect(html).toContain("Set an RSVP deadline"); expect(html).toContain("Limit total event attendance");
    expect(html).not.toContain('type="datetime-local"'); expect(html).not.toContain('inputMode="numeric"');
    html = renderToStaticMarkup(<EventDraftSettingsEditor {...props} initial={{ settings: { ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, capacity: 32, deadlineAtUtc: "2026-11-01T22:00:00.000Z" } }, revision: 1 }} />);
    expect(html).toContain('value="2026-11-01T17:00"'); expect(html).toContain('value="32"'); expect(html).toContain("including hidden guests");
  });
  it("checks the session before reading, rendering, or saving any settings", async () => {
    mocks.auth.mockResolvedValue(false);
    expect(await saveDraftSettings(input)).toMatchObject({ ok: false, message: expect.stringContaining("session") });
    await expect(SettingsPage(context)).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    for (const fn of [mocks.get, mocks.draft, mocks.artwork, mocks.save, mocks.publication]) expect(fn).not.toHaveBeenCalled();
  });
  it("saves validated choices and refreshes the private setup flow and event list", async () => {
    expect(await saveDraftSettings(input)).toEqual({ ok: true, revision: 1 });
    expect(mocks.save).toHaveBeenCalledWith(id, 0, DEFAULT_DRAFT_SETTINGS);
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/events"], [`/admin/events/${id}`, "layout"]]);
  });
  it.each([null, [], {}, { ...input, id: "bad" }, { ...input, revision: -1 }, { ...input, revision: "0" }, { ...input, settings: {} }, { ...input, settings: { ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, photos: true } } }])("rejects malformed submissions before storage: %j", async (value) => {
    expect((await saveDraftSettings(value)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("never claims success after duplicate/stale saves or database failure", async () => {
    mocks.save.mockResolvedValue(null); expect(await saveDraftSettings(input)).toMatchObject({ ok: false, conflict: true });
    mocks.save.mockRejectedValue(new Error("postgresql://secret@host/db"));
    const result = await saveDraftSettings(input);
    expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret"); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("renders an editable private setup with navigation, preview, and checklist", async () => {
    const html = renderToStaticMarkup(await SettingsPage(context));
    for (const text of ["Private party", "Maximum guests per RSVP", "Allow an optional comment", "Start “Show my name” checked", "Save draft settings", "Suggested defaults", "Getting ready to gather", "Guest experience preview", `href="/admin/events/${id}/artwork"`, "These draft choices stay private."]) expect(html).toContain(text);
    expect(html).not.toMatch(/Publish event|Share link|spotify.com|172 Belmont|DATABASE_URL|ADMIN_PASSWORD/);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
  it("does not render default visibility controls when guest list is off", () => {
    const settings = { ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, guestList: false } };
    const html = renderToStaticMarkup(<EventDraftSettingsEditor draft={draft} artwork={EMPTY_DRAFT_ARTWORK} initial={{ settings, revision: 2 }} />);
    expect(html).not.toContain("Start “Show my name” checked"); expect(html).not.toContain("Show my name on the guest list");
    expect(html).toContain("Your saved choices are up to date");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });
  it("handles invalid/missing drafts and setup errors without private details", async () => {
    await expect(SettingsPage({ params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("not found"); expect(mocks.get).not.toHaveBeenCalled();
    mocks.draft.mockResolvedValue(null); await expect(SettingsPage(context)).rejects.toThrow("not found");
    mocks.get.mockRejectedValue(new Error("private database secret"));
    const html = renderToStaticMarkup(await SettingsPage(context));
    expect(html).toContain("migrations through 019"); expect(html).not.toContain("private database secret");
  });
  it("does not report weather as incomplete when its saved location is confirmed", async () => {
    const coordinates = { latitude: 30, longitude: -81 };
    mocks.publication.mockResolvedValue({ snapshot: { details: draft, coordinates } });
    expect((await SettingsPage(context)).props.coordinates).toEqual(coordinates);
    mocks.draft.mockResolvedValue({ ...draft, address: "New event address" });
    expect((await SettingsPage(context)).props.coordinates).toBeNull();
  });
  it("shows unavailable instead of an invented checklist if publication status cannot load", async () => {
    mocks.publication.mockRejectedValue(new Error("private database secret"));
    const html = renderToStaticMarkup(await SettingsPage(context));
    expect(html).toContain("Settings couldn’t load");
    expect(html).not.toMatch(/private database secret|Getting ready to gather|Save draft settings/);
  });
  it("escapes event text in settings and guest previews", () => {
    const html = renderToStaticMarkup(<EventDraftSettingsEditor draft={{ ...draft, title: "<script>unsafe</script>" }} artwork={EMPTY_DRAFT_ARTWORK} initial={{ settings: DEFAULT_DRAFT_SETTINGS, revision: 0 }} />);
    expect(html).not.toContain("<script>unsafe"); expect(html).toContain("&lt;script&gt;");
  });
});
