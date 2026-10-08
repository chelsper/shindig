import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), copy: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), replace: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-duplication", () => ({ getDuplicationSource: mocks.source, duplicateEventRecord: mocks.copy }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ replace: mocks.replace }) }));
import Page, { dynamic, metadata } from "../app/admin/events/duplicate/[source]/page";
import { duplicateEvent } from "../app/admin/events/duplicate/actions";
import { EventDuplicateForm } from "../components/admin/event-duplicate-form";
import { EventDuplicationError } from "../lib/event-duplication";
import { draft, eventId, otherEventId, snapshot } from "./fixtures/publication";
const input = { source: eventId, requestId: otherEventId, fingerprint: "a".repeat(64), title: " A new party ", confirmed: true };
const props = { params: Promise.resolve({ source: eventId }) };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.copy.mockResolvedValue(otherEventId);
  mocks.source.mockResolvedValue({ key: eventId, details: draft, settings: snapshot.settings, settingsSaved: true, fingerprint: input.fingerprint, images: { invitation: { locator: "private-sensitive-path", alt: "Private" }, header: null } });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("host-only duplication screen and action", () => {
  it("authenticates before reading a source or writing a copy", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(Page(props)).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    expect(await duplicateEvent(input)).toMatchObject({ ok: false, message: expect.stringContaining("session") });
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(dynamic).toBe("force-dynamic"); expect(metadata.robots).toEqual({ index: false, follow: false }); expect(metadata.referrer).toBe("no-referrer");
  });
  it("generates unique confirmation keys on GET without creating an event, exposing only safe props", async () => {
    const first = await Page(props), second = await Page(props);
    expect(first.props.requestId).not.toEqual(second.props.requestId);
    expect(Object.keys(first.props).sort()).toEqual(["fingerprint", "hasArtwork", "requestId", "settingsSaved", "source", "sourceTitle"].sort());
    expect(JSON.stringify(first.props)).not.toMatch(/private-sensitive-path|Example Lane/);
    expect(mocks.copy).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(first);
    expect(html).toContain("Garden Supper (copy)"); expect(html).toContain("latest saved setup");
    expect(html).toContain("Nothing is published"); expect(html).toContain("Independent copies");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create private copy/);
    expect(html).toContain(`href="/admin/events/${eventId}/setup"`);
  });
  it("rejects malformed and missing sources without rendering a confirmation", async () => {
    await expect(Page({ params: Promise.resolve({ source: "../../" }) })).rejects.toThrow("not found"); expect(mocks.source).not.toHaveBeenCalled();
    mocks.source.mockResolvedValue(null); await expect(Page(props)).rejects.toThrow("not found");
  });
  it("does not present a default source or leak errors when storage fails", async () => {
    mocks.source.mockRejectedValue(new Error("postgresql://secret@db"));
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain("This setup couldn’t load"); expect(html).not.toMatch(/<form|Create private copy|secret/);
  });
  it("normalizes writes and refreshes only host listing and the destination", async () => {
    expect(await duplicateEvent(input)).toEqual({ ok: true, id: otherEventId });
    expect(mocks.copy).toHaveBeenCalledWith({ ...input, title: "A new party" });
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/events"], [`/admin/events/${otherEventId}`, "layout"]]);
  });
  it.each([{}, { ...input, confirmed: false }, { ...input, title: " " }, { ...input, fingerprint: "bad" }])("validates malicious or incomplete action requests: %j", async (value) => {
    expect((await duplicateEvent(value)).ok).toBe(false); expect(mocks.copy).not.toHaveBeenCalled();
  });
  it("returns a friendly retry, not a false success, on an uncertain database/storage failure", async () => {
    mocks.copy.mockRejectedValue(new Error("postgresql://secret@db"));
    const result = await duplicateEvent(input);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("Retry here safely") });
    expect(JSON.stringify(result)).not.toContain("secret"); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret"); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("preserves safe stale-review and configuration guidance", async () => {
    mocks.copy.mockRejectedValue(new EventDuplicationError("Reopen Duplicate Event to review the latest setup."));
    expect(await duplicateEvent(input)).toEqual({ ok: false, message: "Reopen Duplicate Event to review the latest setup." });
  });
  it("explains legacy differences and unsaved defaults and escapes the source name", () => {
    const html = renderToStaticMarkup(<EventDuplicateForm {...input} source="oyster-roast-2026" sourceTitle="<script>not markup</script>" hasArtwork={false} settingsSaved={false} />);
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("Jasper Shucks stays exactly as it is"); expect(html).toContain("no artwork to copy");
    expect(html).toContain("unsaved defaults"); expect(html).toContain("standard invitation labels");
  });
});
