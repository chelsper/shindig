import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_INVITATION_SETTINGS as settings } from "../lib/invitation-settings";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), save: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), upload: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/invitation-settings", () => ({ getInvitationSettings: mocks.get, saveInvitationSettings: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.upload, upload: vi.fn() }));
import { saveInvitation } from "../app/admin/invitation/actions";
import AdminInvitationPage from "../app/admin/invitation/page";
import { POST } from "../app/api/admin/invitation/upload/route";

const request = () => ({ settings: structuredClone(settings), revision: 0, startsAtLocal: "2026-11-07T17:00", endsAtLocal: "2026-11-07T21:00", locationConfirmed: false });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.get.mockResolvedValue({ settings, revision: 0 }); mocks.save.mockResolvedValue(1);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("host-only invitation editing", () => {
  it("requires authentication before reading or writing any settings", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await saveInvitation(request())).ok).toBe(false);
    await expect(AdminInvitationPage()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("publishes validated details and refreshes invitation, Hub, calendars and private RSVP pages", async () => {
    const result = await saveInvitation(request());
    expect(result).toEqual({ ok: true, settings, revision: 1 });
    expect(mocks.save).toHaveBeenCalledWith(settings, 0);
    for (const path of ["/", "/event", "/admin", "/admin/invitation", "/calendar/oyster-roast.ics", "/api/weather"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
    expect(mocks.revalidate).toHaveBeenCalledWith("/rsvp/[token]", "page");
  });
  it.each([null, {}, { ...request(), revision: "0" }, { ...request(), settings: { ...settings, title: " " } }, { ...request(), startsAtLocal: "2026-03-08T02:30" }])("rejects invalid requests server-side", async (input) => {
    expect((await saveInvitation(input)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires explicit location confirmation on address changes", async () => {
    const input = request(); input.settings.address = "New address";
    expect(await saveInvitation(input)).toMatchObject({ ok: false, message: expect.stringContaining("coordinates") });
    expect(mocks.save).not.toHaveBeenCalled();
    input.locationConfirmed = true;
    expect((await saveInvitation(input)).ok).toBe(true);
  });
  it("rejects stale editor revisions before writing", async () => {
    mocks.get.mockResolvedValue({ settings, revision: 1 });
    expect(await saveInvitation(request())).toMatchObject({ ok: false, message: expect.stringContaining("Reload") });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("handles a competing save after the initial version check", async () => {
    mocks.save.mockResolvedValue(null);
    expect(await saveInvitation(request())).toMatchObject({ ok: false, message: expect.stringContaining("Reload") });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("never claims success or exposes details on database failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.save.mockRejectedValue(new Error("postgresql://private-password@db"));
    const result = await saveInvitation(request());
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("private-password");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("renders editable invitation fields and a storage warning, never an active guest form", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const html = renderToStaticMarkup(await AdminInvitationPage());
    for (const text of ["Your invitation", "Event title", "Description", "Starts", "RSVP heading", "Invitation artwork", "Save &amp; publish invitation", "Vercel Blob", 'href="/admin"', 'href="/"']) expect(html).toContain(text);
    expect(html).not.toContain("Submit RSVP"); expect(html).not.toContain("DATABASE_URL");
  });
  it("renders a friendly setup error without exposing database details", async () => {
    mocks.get.mockRejectedValue(new Error("private DB details"));
    const html = renderToStaticMarkup(await AdminInvitationPage());
    expect(html).toContain("migration 009"); expect(html).not.toContain("private DB details");
  });
});

describe("protected invitation artwork uploads", () => {
  const tokenRequest = () => new Request("https://shindig.test/api/admin/invitation/upload", { method: "POST", body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }) });
  it("refuses anonymous upload tokens", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await POST(tokenRequest())).status).toBe(401); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("refuses malformed requests and gracefully handles absent Blob storage", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect((await POST(new Request("https://shindig.test", { method: "POST", body: "null" }))).status).toBe(400);
    expect((await POST(tokenRequest())).status).toBe(503);
  });
  it("scopes tokens to this invitation, image types and 10MB, with a second auth check", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "private-blob-token");
    mocks.upload.mockResolvedValue({ type: "blob.generate-client-token", clientToken: "scoped-upload-token" });
    const response = await POST(tokenRequest());
    expect(response.status).toBe(200); expect(await response.text()).not.toContain("private-blob-token");
    const options = mocks.upload.mock.calls[0][0];
    await expect(options.onBeforeGenerateToken("invitation/oyster-roast-2026/artwork.png")).resolves.toMatchObject({ maximumSizeInBytes: 10485760, addRandomSuffix: true });
    for (const path of ["event-hub/oyster-roast-2026/artwork.png", "invitation/other/artwork.png", "invitation/oyster-roast-2026/a.svg", "invitation/oyster-roast-2026/../a.png"]) await expect(options.onBeforeGenerateToken(path)).rejects.toThrow();
    mocks.auth.mockResolvedValue(false);
    await expect(options.onBeforeGenerateToken("invitation/oyster-roast-2026/artwork.png")).rejects.toThrow("Unauthorized");
  });
});
