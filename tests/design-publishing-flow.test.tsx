import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), configured: vi.fn(), verify: vi.fn(), session: vi.fn(), drafts: vi.fn(), publications: vi.fn(), redirect: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth, isAdminConfigured: mocks.configured, verifyAdminPassword: mocks.verify, createAdminSession: mocks.session, clearAdminSession: vi.fn() }));
vi.mock("../lib/server/event-drafts", () => ({ listEventDrafts: mocks.drafts }));
vi.mock("../lib/server/event-publications", () => ({ listHostPublications: mocks.publications }));
vi.mock("../lib/server/rsvps", () => ({ createRsvpForAdmin: vi.fn(), deleteRsvpForAdmin: vi.fn(), updateRsvpForAdmin: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import UseDesignPage from "../app/admin/design/page";
import { loginAdmin } from "../app/admin/actions";
import { parseEventDesignId, EVENT_DESIGNS } from "../lib/event-design";
import { EventDraftArtworkEditor } from "../components/admin/event-draft-artwork-editor";
vi.mock("../app/admin/events/[id]/artwork/actions", () => ({ saveDraftArtwork: vi.fn() }));
import { draft, snapshot, eventId } from "./fixtures/publication";

beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue(true); mocks.configured.mockReturnValue(true); mocks.verify.mockReturnValue(true);
  mocks.drafts.mockResolvedValue([draft]); mocks.publications.mockResolvedValue([]);
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe("playground → protected event design handoff", () => {
  it.each(EVENT_DESIGNS)("only accepts canonical $id style IDs", ({ id }) => { expect(parseEventDesignId(id)).toBe(id); });
  it.each([null, undefined, "unknown", "https://evil.example", "//evil.example", ["coastal"], { style: "coastal" }])("rejects malformed style %j", (value) => { expect(parseEventDesignId(value)).toBeNull(); });
  it("asks for sign-in without retrieving or exposing event data", async () => {
    mocks.auth.mockResolvedValue(false);
    const html = renderToStaticMarkup(await UseDesignPage({ searchParams: Promise.resolve({ style: "coastal" }) }));
    expect(html).toContain("Host password"); expect(html).toContain('name="designStyle" value="coastal"');
    expect(html).not.toContain(draft.title); expect(mocks.drafts).not.toHaveBeenCalled(); expect(mocks.publications).not.toHaveBeenCalled();
  });
  it("reports unconfigured access without revealing any events", async () => {
    mocks.auth.mockResolvedValue(false); mocks.configured.mockReturnValue(false);
    const html = renderToStaticMarkup(await UseDesignPage({ searchParams: Promise.resolve({ style: "coastal" }) }));
    expect(html).toContain("Host access is not configured"); expect(html).not.toContain('type="password"'); expect(mocks.drafts).not.toHaveBeenCalled();
  });
  it("offers authenticated existing and new event paths carrying the style", async () => {
    const html = renderToStaticMarkup(await UseDesignPage({ searchParams: Promise.resolve({ style: "after-dark" }) }));
    expect(html).toContain(`href="/admin/events/${eventId}/artwork?style=after-dark"`);
    expect(html).toContain('href="/admin/events/new?style=after-dark"');
    expect(html).toContain("Only the After Dark style choice carries over"); expect(html).not.toMatch(/guest_name|<form|Publish event/);
  });
  it("does not offer archived events or silently substitute another style", async () => {
    mocks.publications.mockResolvedValue([{ id: eventId, visibility: "archived" }]);
    const html = renderToStaticMarkup(await UseDesignPage({ searchParams: Promise.resolve({ style: "classic" }) }));
    expect(html).not.toContain(draft.title); expect(html).toContain("No active event drafts yet");
    mocks.drafts.mockClear();
    expect(renderToStaticMarkup(await UseDesignPage({ searchParams: Promise.resolve({ style: "javascript:evil" }) }))).toContain("Choose your look");
    expect(mocks.drafts).not.toHaveBeenCalled();
  });
  it("fails safely if event status cannot load", async () => {
    mocks.publications.mockRejectedValueOnce(new Error("private database detail"));
    const html = renderToStaticMarkup(await UseDesignPage({ searchParams: Promise.resolve({ style: "classic" }) }));
    expect(html).toContain("Your events couldn’t load"); expect(html).not.toContain("private database detail"); expect(html).not.toContain(draft.title);
  });
  it("offers the requested style without automatically changing the saved draft", () => {
    const html = renderToStaticMarkup(<EventDraftArtworkEditor draft={draft} initial={{ settings: snapshot.artwork, revision: 0 }} uploadConfigured={false} requestedDesign="coastal" />);
    expect(html).toContain("Apply Coastal"); expect(html).toContain("does not save or publish");
    expect((html.match(/<input\b[^>]*>/g) ?? []).find((input) => input.includes('value="original"'))).toContain('checked=""');
    expect((html.match(/<button\b[^>]*>/g) ?? []).find((button) => button.includes('aria-label="Save draft design &amp; artwork"'))).toContain('disabled=""');
    expect(snapshot.artwork.design).toBeUndefined();
  });
  it.each(["classic", "coastal", "after-dark"])("returns to %s after authenticated login", async (style) => {
    const form = new FormData(); form.set("password", "test-password"); form.set("designStyle", style);
    await expect(loginAdmin({ error: null }, form)).rejects.toThrow(`redirect:/admin/design?style=${style}`);
    expect(mocks.session).toHaveBeenCalledOnce();
  });
  it("never accepts an arbitrary login redirect or bypasses a bad password", async () => {
    const form = new FormData(); form.set("password", "test-password"); form.set("designStyle", "//evil.example"); form.set("returnTo", "https://evil.example");
    await expect(loginAdmin({ error: null }, form)).rejects.toThrow("redirect:/admin"); expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    mocks.session.mockClear(); mocks.redirect.mockClear(); mocks.verify.mockReturnValue(false);
    expect(await loginAdmin({ error: null }, form)).toMatchObject({ error: expect.stringContaining("isn’t correct") });
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
