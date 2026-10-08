import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn(), get: vi.fn(), put: vi.fn(), fetch: vi.fn(), read: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-draft-artwork", () => ({ draftImageStorageToken: mocks.token }));
vi.mock("@vercel/blob", () => ({ get: mocks.get, put: mocks.put }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
import { copyEventArtwork, isLegacyCopyImage, type CopyArtworkSource } from "../lib/server/duplicate-artwork";
import { DRAFT_IMAGE_LIMIT, EMPTY_DRAFT_ARTWORK, isDraftImagePath } from "../lib/event-draft-artwork";
import { eventId as sourceId, otherEventId as destinationId } from "./fixtures/publication";

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32)]);
const path = `event-drafts/${sourceId}/invitation/${destinationId}.png`;
const source: CopyArtworkSource = { key: sourceId, images: { invitation: { locator: path, alt: "Garden artwork" }, header: null }, crop: { focalX: 30, focalY: 60, zoomPercent: 120 } };
const stream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
const blob = (bytes = png, contentType = "image/png", size = bytes.length) => ({ statusCode: 200, stream: stream(bytes), blob: { size, contentType } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.token.mockReturnValue("private-test-token");
  mocks.get.mockImplementation(async () => blob()); mocks.read.mockResolvedValue(png);
  mocks.put.mockImplementation(async (pathname: string) => ({ pathname, url: `https://test.private.blob.vercel-storage.com/${pathname}` }));
  vi.stubGlobal("fetch", mocks.fetch);
});
describe("independently owned private artwork copies", () => {
  it("copies validated bytes and crop settings into the new event's private namespace", async () => {
    const result = await copyEventArtwork(destinationId, source);
    expect(isDraftImagePath(destinationId, result.invitation.path, "invitation")).toBe(true);
    expect(result.invitation.path).not.toBe(path); expect(result.invitation.alt).toBe("Garden artwork");
    expect(result.header).toEqual({ ...EMPTY_DRAFT_ARTWORK.header, ...source.crop });
    expect(mocks.get).toHaveBeenCalledWith(path, expect.objectContaining({ access: "private", useCache: false }));
    expect(mocks.put).toHaveBeenCalledWith(result.invitation.path, png, expect.objectContaining({ access: "private", allowOverwrite: false, addRandomSuffix: false }));
  });
  it("uses separate paths for invitation/header and other event copies", async () => {
    const both = { ...source, images: { ...source.images, header: { locator: path.replace("/invitation/", "/header/"), alt: "Header" } } };
    const result = await copyEventArtwork(destinationId, both);
    expect(result.header.path).not.toBe(result.invitation.path);
    const other = await copyEventArtwork("4ce841cf-8c90-416e-b2bc-1c264b916b9b", source);
    expect(other.invitation.path).not.toBe(result.invitation.path);
  });
  it("requires no Blob store for text-only copies", async () => {
    mocks.token.mockReturnValue(undefined);
    const result = await copyEventArtwork(destinationId, { ...source, images: { invitation: null, header: null } });
    expect(result.invitation.path).toBeNull(); expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("checks host authorization before any file or network access", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(copyEventArtwork(destinationId, source)).rejects.toThrow("Host access");
    expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("fails clearly when image storage is not configured", async () => {
    mocks.token.mockReturnValue(undefined);
    await expect(copyEventArtwork(destinationId, source)).rejects.toThrow("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["https://example.com/image.png", path.replace(sourceId, destinationId), path.replace("/invitation/", "/header/"), "../image.png"])("rejects a source image not owned by the source event: %s", async (locator) => {
    await expect(copyEventArtwork(destinationId, { ...source, images: { ...source.images, invitation: { locator, alt: "Artwork" } } })).rejects.toThrow();
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("cannot copy onto its source identity", async () => {
    await expect(copyEventArtwork(sourceId, source)).rejects.toThrow(); expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each([() => null, () => ({ statusCode: 304 }), () => blob(png, "text/html"), () => blob(png, "image/png", DRAFT_IMAGE_LIMIT + 1), () => blob(Buffer.alloc(0)), () => blob(Buffer.from("<script>not an image</script>")), () => blob(Buffer.alloc(DRAFT_IMAGE_LIMIT + 1), "image/png", 1)])("rejects unavailable, invalid and oversized image bytes", async (response) => {
    mocks.get.mockImplementation(async () => response());
    await expect(copyEventArtwork(destinationId, source)).rejects.toThrow(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("accepts a retried write only after verifying the destination's actual identical bytes", async () => {
    mocks.put.mockRejectedValue(new Error("Write response lost"));
    const result = await copyEventArtwork(destinationId, source);
    expect(mocks.get).toHaveBeenLastCalledWith(result.invitation.path, expect.objectContaining({ useCache: false }));
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
  it.each([() => null, () => blob(Buffer.concat([png.subarray(0, -1), Buffer.from([1])])), () => blob(png, "image/jpeg"), () => blob(png, "image/png", 1)])("does not accept a missing or different destination after a failed write", async (response) => {
    mocks.put.mockRejectedValue(new Error("Write failed"));
    mocks.get.mockResolvedValueOnce(blob()).mockImplementation(async () => response());
    await expect(copyEventArtwork(destinationId, source)).rejects.toThrow("Write failed");
  });
});
describe("legacy artwork boundaries", () => {
  const legacy = { ...source, key: "oyster-roast-2026" };
  const url = "https://test.public.blob.vercel-storage.com/invitation/oyster-roast-2026/art.png";
  it.each(["http://test.public.blob.vercel-storage.com/invitation/oyster-roast-2026/art.png", "https://127.0.0.1/art.png", `${url}?secret=yes`, `${url}#fragment`, url.replace("test.public", "user:pass@test.public"), url.replace(".com/", ".com:444/"), url.replace("oyster-roast-2026", "another-event"), url.replace(".png", ".svg"), url.replace(".com/", ".com.evil.test/"), "file:///private/image.png"])("rejects unsafe legacy locator %s", (value) => { expect(isLegacyCopyImage(value, "invitation")).toBe(false); });
  it("copies only the bundled original file for the canonical local asset", async () => {
    await copyEventArtwork(destinationId, { ...legacy, images: { invitation: { locator: "/oyster-roast-invitation.png", alt: "Oysters" }, header: null } });
    expect(mocks.read).toHaveBeenCalledWith(expect.stringMatching(/\/public\/oyster-roast-invitation\.png$/));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fetches a saved public Blob without redirecting or sending secrets", async () => {
    mocks.fetch.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
    await copyEventArtwork(destinationId, { ...legacy, images: { invitation: { locator: url, alt: "Oysters" }, header: null } });
    expect(mocks.fetch).toHaveBeenCalledWith(url, { redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) });
    expect(isLegacyCopyImage(url, "header")).toBe(false);
    expect(isLegacyCopyImage(url.replace("/invitation/", "/event-hub/"), "header")).toBe(true);
  });
  it("rejects public provider failures without accepting a fake copy", async () => {
    mocks.fetch.mockResolvedValue(new Response("Failed", { status: 503 }));
    await expect(copyEventArtwork(destinationId, { ...legacy, images: { invitation: { locator: url, alt: "Oysters" }, header: null } })).rejects.toThrow();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
