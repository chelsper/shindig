import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ principal: vi.fn(), review: vi.fn(), receipt: vi.fn(), pending: vi.fn(), remove: vi.fn(), cleanup: vi.fn(), refresh: vi.fn() }));
vi.mock("../lib/server/host-access", () => ({ getHostPrincipal: state.principal }));
vi.mock("../lib/server/event-deletion", () => ({ getEventDeletionReview: state.review, getEventDeletionReceipt: state.receipt, listPendingEventDeletions: state.pending, deleteOwnedEvent: state.remove, cleanupDeletedEventArtwork: state.cleanup }));
vi.mock("next/cache", () => ({ revalidatePath: state.refresh }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not found"); } }));
import { parseDeletionInput } from "../lib/event-deletion";
import { deleteEvent, finishArtworkCleanup } from "../app/admin/events/[id]/privacy/actions";
import EventPrivacyPage from "../app/admin/events/[id]/privacy/page";
import AccountPage from "../app/host/account/page";
import { EventDeletionControls } from "../components/admin/event-deletion-controls";
import { eventId } from "./fixtures/publication";

const review = { id: eventId, title: "Garden Supper", details: 2, artwork: 0, settings: 1, publication: 1, visibility: "published" as const };
const input = { ...review, phrase: "DELETE", confirmed: true };
const receipt = { id: eventId, deletedAt: "2026-10-27T14:00:00Z", artworkCleanedAt: null, cleanupReady: false };
const context = { params: Promise.resolve({ id: eventId }) };
beforeEach(() => {
  vi.resetAllMocks(); state.principal.mockResolvedValue({ ownerId: "owner-a", name: "Host A", email: "a@example.test" });
  state.review.mockResolvedValue(review); state.receipt.mockResolvedValue(null); state.pending.mockResolvedValue([]);
  state.remove.mockResolvedValue(receipt); state.cleanup.mockResolvedValue(receipt);
});
describe("event deletion validation and server actions", () => {
  it.each([null, {}, { ...input, id: "oyster-roast-2026" }, { ...input, id: "../event" }, { ...input, phrase: "delete" }, { ...input, confirmed: "true" }, { ...input, confirmed: false }, { ...input, title: "" }, { ...input, details: -1 }, { ...input, artwork: "0" }, { ...input, publication: Infinity }])("rejects malformed or unconfirmed deletion: %j", async value => {
    expect(parseDeletionInput(value)).toBeNull(); expect((await deleteEvent(value)).ok).toBe(false); expect(state.remove).not.toHaveBeenCalled();
  });
  it("passes only valid input to the owner-checking DAL and refreshes both host and public pages", async () => {
    expect(await deleteEvent(input)).toEqual({ ok: true, receipt });
    expect(state.refresh.mock.calls).toEqual([["/e/[slug]", "layout"], ["/admin/events", "layout"], ["/host/account"]]);
  });
  it("never reports success or intact data for stale, missing, failed, or uncertain database responses", async () => {
    state.remove.mockResolvedValueOnce("stale"); expect(await deleteEvent(input)).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
    state.remove.mockResolvedValueOnce("missing"); expect((await deleteEvent(input)).ok).toBe(false);
    state.remove.mockRejectedValue(new Error("postgresql://secret"));
    const result = await deleteEvent(input); expect(result).toMatchObject({ ok: false, message: expect.stringContaining("couldn’t confirm") });
    expect(JSON.stringify(result)).not.toMatch(/postgresql|intact|not been deleted/); expect(state.refresh).not.toHaveBeenCalled();
  });
  it("keeps delayed/failed artwork cleanup distinct from completed deletion", async () => {
    expect(await finishArtworkCleanup(eventId)).toEqual({ ok: true, receipt });
    state.cleanup.mockRejectedValue(new Error("token-secret"));
    const result = await finishArtworkCleanup(eventId); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("token-secret");
    state.cleanup.mockResolvedValue(null); expect((await finishArtworkCleanup(eventId)).ok).toBe(false);
  });
});
describe("private account and deletion pages", () => {
  it("redirects anonymous visitors before querying any private data", async () => {
    state.principal.mockResolvedValue(null);
    await expect(EventPrivacyPage(context)).rejects.toThrow("redirect:/host/sign-in"); await expect(AccountPage()).rejects.toThrow("redirect:/host/sign-in");
    expect(state.review).not.toHaveBeenCalled(); expect(state.receipt).not.toHaveBeenCalled(); expect(state.pending).not.toHaveBeenCalled();
  });
  it("returns not found for inaccessible events, and friendly failures without private diagnostics", async () => {
    state.review.mockResolvedValue(null); await expect(EventPrivacyPage(context)).rejects.toThrow("not found");
    state.review.mockRejectedValue(new Error("private DB diagnostic"));
    const html = renderToStaticMarkup(await EventPrivacyPage(context));
    expect(html).toContain("Event privacy couldn’t load"); expect(html).not.toContain("private DB diagnostic"); expect(html).not.toContain("Permanently delete event");
  });
  it("offers export and reversible archive first, with explicit consequences and a disabled delete button", async () => {
    const html = renderToStaticMarkup(await EventPrivacyPage(context));
    expect(html).toContain(`href="/admin/events/${eventId}/guests/export"`);
    expect(html).toContain("Archive or delete?"); expect(html).toContain("This cannot be undone"); expect(html).toContain("Type DELETE to confirm");
    expect(html).toContain("This event is live"); expect(html).toMatch(/<button disabled=""[^>]*>Permanently delete event/);
    state.review.mockResolvedValue({ ...review, publication: 0, visibility: null });
    expect(renderToStaticMarkup(await EventPrivacyPage(context))).not.toContain("Download RSVP CSV");
  });
  it("shows owner-only receipts without the erased title or a repeated delete form", async () => {
    state.review.mockResolvedValue(null); state.receipt.mockResolvedValue(receipt);
    const html = renderToStaticMarkup(await EventPrivacyPage(context));
    expect(html).toContain("Event records deleted"); expect(html).toContain("still pending"); expect(html).toContain("does not happen automatically");
    expect(html).not.toContain("Garden Supper"); expect(html).not.toContain("Type DELETE");
    expect(renderToStaticMarkup(<EventDeletionControls review={null} initialReceipt={{ ...receipt, artworkCleanedAt: "2026-10-27T15:00:00Z" }} />)).toContain("Uploaded artwork cleanup is complete");
  });
  it("shows account identity, private cleanup links and a manual request—not automatic account closure", async () => {
    state.pending.mockResolvedValue([receipt]);
    const html = renderToStaticMarkup(await AccountPage());
    expect(html).toContain("a@example.test"); expect(html).toContain("Account closure is reviewed manually");
    expect(html).toContain(`href="/admin/events/${eventId}/privacy"`);
    expect(html).toContain("mailto:support@haveashindig.com?subject=Shindig%20account%20and%20data%20request");
    expect(html).not.toContain("body="); expect(html).not.toContain("<form");
    state.principal.mockResolvedValue({ ownerId: null, name: "Shindig", email: null });
    expect(renderToStaticMarkup(await AccountPage())).not.toContain("Request account deletion");
    state.pending.mockRejectedValue(new Error("private-token"));
    expect(renderToStaticMarkup(await AccountPage())).toContain("cleanup status couldn’t load");
  });
});
