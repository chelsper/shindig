import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), get: vi.fn(), list: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), replace: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ saveEventDraftRecord: mocks.save, getEventDraft: mocks.get, listEventDrafts: mocks.list }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound, useRouter: () => ({ replace: mocks.replace }) }));
import { saveEventDraft } from "../app/admin/events/actions";
import EventsPage from "../app/admin/events/page";
import NewPage from "../app/admin/events/new/page";
import EditPage from "../app/admin/events/[id]/page";
import { EventDraftEditor } from "../components/admin/event-draft-editor";
import { EMPTY_EVENT_DRAFT, type EventDraft } from "../lib/event-drafts";

const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const fields = { ...EMPTY_EVENT_DRAFT, title: "Birthday", startsAtLocal: "2026-11-07T17:00", endsAtLocal: "" };
const draft: EventDraft = { ...EMPTY_EVENT_DRAFT, title: "Private party", id, status: "draft", revision: 2, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
const props = { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.save.mockResolvedValue({ id, revision: 1 }); mocks.get.mockResolvedValue(draft); mocks.list.mockResolvedValue([]);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("private event draft actions and pages", () => {
  it("checks the admin session before reads, form rendering or writes", async () => {
    mocks.auth.mockResolvedValue(false);
    expect(await saveEventDraft({ id, revision: 0, fields })).toMatchObject({ ok: false, message: expect.stringContaining("session") });
    for (const page of [() => EventsPage(), () => NewPage(), () => EditPage(props)]) await expect(page()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("saves normalized event-local data and only refreshes private draft routes", async () => {
    expect(await saveEventDraft({ id, revision: 0, fields })).toEqual({ ok: true, id, revision: 1 });
    expect(mocks.save).toHaveBeenCalledWith(id, 0, { ...EMPTY_EVENT_DRAFT, title: "Birthday", startsAtUtc: "2026-11-07T22:00:00.000Z" });
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/events"], [`/admin/events/${id}`]]);
  });
  it.each([null, {}, { id: "bad", revision: 0, fields }, { id, revision: -1, fields }, { id, revision: "0", fields }, { id, revision: 0, fields: { ...fields, title: " " } }, { id, revision: 0, fields: { ...fields, timeZone: "unknown" } }, { id, revision: 0, fields: { ...fields, startsAtLocal: "2026-03-08T02:30" } }])("rejects malformed writes before storage", async (input) => {
    expect((await saveEventDraft(input)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reports stale edits and missing drafts without claiming success", async () => {
    mocks.save.mockResolvedValue(null);
    expect(await saveEventDraft({ id, revision: 1, fields })).toMatchObject({ ok: false, conflict: true });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("returns friendly failure and keeps secrets out of errors and logs", async () => {
    mocks.save.mockRejectedValue(new Error("postgresql://secret@private/db"));
    const result = await saveEventDraft({ id, revision: 0, fields });
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("lists private drafts separately from the existing live event", async () => {
    mocks.list.mockResolvedValue([draft]);
    const html = renderToStaticMarkup(await EventsPage());
    for (const text of ["Live event", "Manage Oyster Roast", "Private draft", "Private party", "Date to be decided", 'href="/admin/events/new"', `href="/admin/events/${id}"`]) expect(html).toContain(text);
    expect(html).not.toMatch(/Publish event|Share link|Submit RSVP/);
  });
  it("shows a friendly empty state or setup error, not invented draft data", async () => {
    expect(renderToStaticMarkup(await EventsPage())).toContain("next good gathering");
    mocks.list.mockRejectedValue(new Error("private connection string"));
    const html = renderToStaticMarkup(await EventsPage());
    expect(html).toContain("migration 010"); expect(html).not.toContain("private connection");
  });
  it("starts a blank draft with a unique creation key without database writes", async () => {
    const first = await NewPage(), second = await NewPage();
    expect(first.props.id).not.toEqual(second.props.id);
    const html = renderToStaticMarkup(first);
    for (const text of ["Let’s make a Shindig", "Save draft", "Hosted by (optional)", "Event timezone", "There is no guest link yet."]) expect(html).toContain(text);
    expect(html).not.toMatch(/value="Another Annualish|172 Belmont|Publish invitation/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reopens stored details and protects against missing/malformed draft IDs", async () => {
    expect(renderToStaticMarkup(await EditPage(props))).toContain("Private party");
    mocks.get.mockClear();
    await expect(EditPage({ ...props, params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("not found");
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue(null);
    await expect(EditPage(props)).rejects.toThrow("not found");
  });
  it("renders escaped user content and an explicit private save confirmation", () => {
    const html = renderToStaticMarkup(<EventDraftEditor id={id} initialDraft={{ ...draft, title: "<script>unsafe</script>" }} justSaved timeZones={["America/New_York"]} />);
    expect(html).not.toContain("<script>unsafe"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Draft saved. It remains private; no invitation has been published.");
    expect(html).toContain('href="/admin/events"');
  });
});
