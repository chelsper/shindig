import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), publication: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-publications", () => ({ getHostEventPublication: mocks.publication }));
import { GET } from "../app/admin/events/[id]/share/qr/route";
import { createEventQr } from "../lib/server/event-qr";
import { publication, eventId, eventSlug } from "./fixtures/publication";
const context = { params: Promise.resolve({ id: eventId }) };
const request = (query = "target=invitation&format=png") => new Request(`https://untrusted-host.example/admin/events/${eventId}/share/qr?${query}`);
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.publication.mockResolvedValue({ ...publication, publicAlias: "garden-supper" }); });
describe("authenticated QR downloads", () => {
  it("authenticates before inspecting event data", async () => {
    mocks.auth.mockResolvedValue(false); expect((await GET(request(), context)).status).toBe(401); expect(mocks.publication).not.toHaveBeenCalled();
  });
  it.each([null, { ...publication, visibility: "unpublished" }, { ...publication, visibility: "archived" }])("denies draft or inactive QR generation", async (row) => {
    mocks.publication.mockResolvedValue(row); expect((await GET(request(), context)).status).toBe(404);
  });
  it.each(["target=evil", "target=invitation&format=html", "target=https://evil.test", "format=png"])("rejects invalid options: %s", async (query) => {
    expect((await GET(request(query), context)).status).toBe(400); expect(mocks.publication).not.toHaveBeenCalled();
  });
  it("rejects invalid event identifiers before reading data", async () => {
    expect((await GET(request(), { params: Promise.resolve({ id: "../admin" }) })).status).toBe(400); expect(mocks.publication).not.toHaveBeenCalled();
  });
  it.each(["invitation", "hub"] as const)("returns the actual PNG encoder output for %s with private headers", async (target) => {
    const response = await GET(request(`target=${target}&format=png&url=https://evil.test&token=private`), context);
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("image/png"); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain(`shindig-garden-supper-${target}.png`);
    const bytes = new Uint8Array(await response.arrayBuffer()); expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(bytes).toEqual(await createEventQr("garden-supper", target, "png"));
  });
  it("returns printable self-contained SVG, never a remote image or script", async () => {
    const response = await GET(request("target=hub&format=svg"), context), svg = await response.text();
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("image/svg+xml"); expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(svg).toContain("<svg"); expect(svg).toContain("viewBox="); expect(svg).not.toMatch(/<script|<image|href=|<foreignObject/); expect(svg).toBe(await createEventQr("garden-supper", "hub", "svg"));
  });
  it("supports existing ID-based publications and closes safely on errors", async () => {
    mocks.publication.mockResolvedValue(publication); expect(await (await GET(request("target=hub&format=svg"), context)).text()).toBe(await createEventQr(eventSlug, "hub", "svg"));
    mocks.publication.mockRejectedValue(new Error("postgresql://secret")); const response = await GET(request(), context); expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  });
});
