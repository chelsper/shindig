import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), getSettings: vi.fn(), save: vi.fn(), token: vi.fn(), get: vi.fn(), put: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ draftImageStorageToken: mocks.token, getDraftArtwork: mocks.getSettings, saveDraftArtworkRecord: mocks.save }));
vi.mock("@vercel/blob", () => ({ get: mocks.get, put: mocks.put }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
import { GET, POST } from "../app/admin/events/[id]/artwork/image/route";
import { saveDraftArtwork } from "../app/admin/events/[id]/artwork/actions";
import ArtworkPage from "../app/admin/events/[id]/artwork/page";
import { EventDraftArtworkEditor } from "../components/admin/event-draft-artwork-editor";
import { EMPTY_EVENT_DRAFT } from "../lib/event-drafts";
import { DRAFT_IMAGE_LIMIT, EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";

const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const path = `event-drafts/${id}/invitation/30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6.png`;
const draft = { ...EMPTY_EVENT_DRAFT, id, status: "draft" as const, title: "Private birthday", revision: 1, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
const context = { params: Promise.resolve({ id }) };
const url = `https://www.haveashindig.com/admin/events/${id}/artwork/image`;
const readRequest = (key = path) => new Request(`${url}?path=${encodeURIComponent(key)}`);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array(16).fill(0)]);
async function uploadRequest({ origin = "https://www.haveashindig.com", type = "image/png", bytes = png, kind = "invitation", length }: { origin?: string; type?: string; bytes?: Uint8Array; kind?: string; length?: number } = {}) {
  const form = new FormData(); form.set("kind", kind); form.set("file", new Blob([Buffer.from(bytes)], { type }), "private-event.png");
  const temp = new Request(url, { method: "POST", body: form });
  const body = await temp.arrayBuffer();
  return new Request(url, { method: "POST", body, headers: { origin, "content-type": temp.headers.get("content-type")!, "content-length": String(length ?? body.byteLength) } });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft); mocks.token.mockReturnValue("server-private-token");
  mocks.getSettings.mockResolvedValue({ settings: EMPTY_DRAFT_ARTWORK, revision: 0 }); mocks.save.mockResolvedValue(1);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
  mocks.put.mockImplementation(async (pathname: string) => ({ pathname, url: `https://test.private.blob.vercel-storage.com/${pathname}` }));
  mocks.get.mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(png); controller.close(); } }), blob: { size: png.byteLength, contentType: "image/png" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("host-only artwork actions, page and image routes", () => {
  it("checks authentication before reading or writing any draft/image", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await POST(await uploadRequest(), context)).status).toBe(401);
    const denied = await GET(readRequest(), context); expect(denied.status).toBe(401); expect(denied.headers.get("cache-control")).toContain("no-store");
    expect((await saveDraftArtwork({ id, revision: 0, settings: EMPTY_DRAFT_ARTWORK })).ok).toBe(false);
    await expect(ArtworkPage(context)).rejects.toThrow("redirect");
    for (const fn of [mocks.draft, mocks.getSettings, mocks.save, mocks.get, mocks.put]) expect(fn).not.toHaveBeenCalled();
  });
  it("rejects cross-origin uploads before accessing storage", async () => {
    expect((await POST(await uploadRequest({ origin: "https://evil.test" }), context)).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.draft).not.toHaveBeenCalled();
  });
  it("uploads to a server-generated draft-scoped PRIVATE path without returning credentials/URLs", async () => {
    const result = await POST(await uploadRequest(), context); expect(result.status).toBe(200);
    const body = await result.json(); expect(body.path).toMatch(new RegExp(`^event-drafts/${id}/invitation/[a-f0-9-]+\\.png$`));
    expect(Object.keys(body)).toEqual(["path"]); expect(JSON.stringify(body)).not.toContain("server-private-token");
    const [pathname, bytes, options] = mocks.put.mock.calls[0];
    expect(pathname).toBe(body.path); expect(Buffer.from(bytes)).toEqual(Buffer.from(png));
    expect(options).toMatchObject({ access: "private", token: "server-private-token", allowOverwrite: false, addRandomSuffix: false, contentType: "image/png" });
  });
  it.each([{ type: "image/svg+xml" }, { bytes: new TextEncoder().encode("<html>not an image</html>") }, { kind: "../header" }])("rejects unsafe file bodies/slots %j", async (options) => {
    expect((await POST(await uploadRequest(options), context)).status).toBe(400); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("checks declared size and actual streamed size, not just browser validation", async () => {
    expect((await POST(await uploadRequest({ length: DRAFT_IMAGE_LIMIT + 100000 }), context)).status).toBe(413);
    expect((await POST(await uploadRequest({ bytes: new Uint8Array(DRAFT_IMAGE_LIMIT + 100000), length: 1 }), context)).status).toBe(413);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("refuses uploads to missing drafts and handles missing private storage", async () => {
    mocks.draft.mockResolvedValue(null);
    expect((await POST(await uploadRequest(), context)).status).toBe(404);
    mocks.token.mockReturnValue(undefined);
    expect((await POST(await uploadRequest(), context)).status).toBe(503); expect((await GET(readRequest(), context)).status).toBe(503);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("serves images through authenticated /admin routes with private/no-store and nosniff", async () => {
    const result = await GET(readRequest(), context);
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("content-type")).toBe("image/png"); expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("content-security-policy")).toContain("sandbox");
    expect(mocks.get).toHaveBeenCalledWith(path, { access: "private", token: "server-private-token" });
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(png);
  });
  it.each(["https://evil.test/a.png", `event-drafts/30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6/invitation/30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6.png`, "../../secret"])("rejects arbitrary or cross-draft image reads: %s", async (key) => {
    expect((await GET(readRequest(key), context)).status).toBe(404); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("does not serve non-image blobs, missing images, or provider details", async () => {
    mocks.get.mockResolvedValue(null); expect((await GET(readRequest(), context)).status).toBe(404);
    mocks.get.mockResolvedValue({ statusCode: 200, blob: { size: 20, contentType: "text/html" } }); expect((await GET(readRequest(), context)).status).toBe(404);
    mocks.get.mockRejectedValue(new Error("secret-token")); const response = await GET(readRequest(), context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret-token");
    mocks.put.mockRejectedValue(new Error("secret-token")); const upload = await POST(await uploadRequest(), context);
    expect(upload.status).toBe(503); expect(await upload.text()).not.toContain("secret-token");
  });
  it("saves validated settings and revalidates only the private artwork page", async () => {
    expect(await saveDraftArtwork({ id, revision: 0, settings: EMPTY_DRAFT_ARTWORK })).toEqual({ ok: true, revision: 1 });
    expect(mocks.save).toHaveBeenCalledWith(id, 0, EMPTY_DRAFT_ARTWORK);
    expect(mocks.revalidate.mock.calls).toEqual([[`/admin/events/${id}/artwork`]]);
  });
  it.each([null, {}, { id, revision: "0", settings: EMPTY_DRAFT_ARTWORK }, { id, revision: 0, settings: {} }])("rejects malformed actions %j", async (input) => {
    expect((await saveDraftArtwork(input)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("never returns success for failed or stale saves", async () => {
    mocks.save.mockResolvedValue(null); expect(await saveDraftArtwork({ id, revision: 0, settings: EMPTY_DRAFT_ARTWORK })).toMatchObject({ ok: false, conflict: true });
    mocks.save.mockRejectedValue(new Error("private-db-token")); const result = await saveDraftArtwork({ id, revision: 0, settings: EMPTY_DRAFT_ARTWORK });
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("private-db-token"); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("renders an honest storage setup state and separate preview controls", async () => {
    mocks.token.mockReturnValue(undefined);
    const html = renderToStaticMarkup(await ArtworkPage(context));
    for (const copy of ["Set the scene", "Invitation artwork", "Event Hub header", "Mobile artwork preview", "Save draft artwork", "EVENT_DRAFT_BLOB_READ_WRITE_TOKEN"]) expect(html).toContain(copy);
    expect(html).toContain(`href="/admin/events/${id}"`); expect(html).not.toMatch(/server-private-token|Publish invitation|Submit RSVP/);
    expect(renderToStaticMarkup(<EventDraftArtworkEditor draft={draft} initial={{ settings: EMPTY_DRAFT_ARTWORK, revision: 0 }} uploadConfigured />)).not.toContain("Uploads need a private");
  });
  it("handles missing drafts and schema failures without leaking private errors", async () => {
    mocks.draft.mockResolvedValue(null); await expect(ArtworkPage(context)).rejects.toThrow("not found");
    mocks.getSettings.mockRejectedValue(new Error("database-secret")); const html = renderToStaticMarkup(await ArtworkPage(context));
    expect(html).toContain("migration 011"); expect(html).not.toContain("database-secret");
  });
});
