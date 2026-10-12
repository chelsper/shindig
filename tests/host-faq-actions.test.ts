import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), scope: vi.fn(), insert: vi.fn(), update: vi.fn(), refresh: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../lib/server/host-access", () => ({ isHostAuthenticated: mocks.authenticated }));
vi.mock("../lib/server/host-event", () => ({ hostScopeArgs: mocks.scope, refreshHostEvent: mocks.refresh }));
vi.mock("../lib/server/questions", () => ({ insertHostFaq: mocks.insert, updateHostFaq: mocks.update }));
import { saveHostFaq } from "../app/admin/questions/actions";
import { validateHostFaq, validateGuestQuestion } from "../lib/server/event-content-validation";
const id = "9d366c85-1b73-4c3e-99e8-e751d75965aa";
const input = { question: " Where do we park? ", answer: " By the gate. ", isPublished: false };
beforeEach(() => { vi.resetAllMocks(); mocks.authenticated.mockResolvedValue(true); mocks.scope.mockResolvedValue([{ slug: "owned" }]); mocks.insert.mockResolvedValue(true); mocks.update.mockResolvedValue(true); });
describe("host FAQ validation and actions", () => {
  it("trims text and drops spoofed author, event, guest and revision fields", () => {
    expect(validateHostFaq({ ...input, source: "guest", guestName: "Name", eventSlug: "other", revision: 99 })).toEqual({ success: true, data: { question: "Where do we park?", answer: "By the gate.", isPublished: false } });
    expect(validateGuestQuestion({ requestToken: id, question: "Guest?", source: "host", answer: "Forged", isPublished: true })).toEqual({ success: true, data: { requestToken: id, question: "Guest?", guestName: null } });
  });
  it.each([null, [], {}, { ...input, question: " " }, { ...input, question: 12 }, { ...input, question: "x".repeat(1001) }, { ...input, answer: " " }, { ...input, answer: "x".repeat(2001) }, { ...input, answer: true }, { ...input, isPublished: "true" }])("rejects invalid FAQ fields: %j", async value => {
    expect(validateHostFaq(value).success).toBe(false);
    expect((await saveHostFaq(id, 0, value)).ok).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.scope).not.toHaveBeenCalled();
  });
  it("accepts maximum lengths and explicit approval", () => { expect(validateHostFaq({ question: "x".repeat(1000), answer: "x".repeat(2000), isPublished: true }).success).toBe(true); });
  it("denies unauthenticated creation and edits before resolving storage", async () => {
    mocks.authenticated.mockResolvedValue(false);
    for (const revision of [0, 1]) expect((await saveHostFaq(id, revision, input)).ok).toBe(false);
    expect(mocks.scope).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %s", async revision => { expect((await saveHostFaq(id, revision, input)).ok).toBe(false); expect(mocks.scope).not.toHaveBeenCalled(); });
  it("requires a valid request or record ID", async () => { expect((await saveHostFaq("invalid", 0, input)).ok).toBe(false); expect(mocks.insert).not.toHaveBeenCalled(); });
  it("creates or edits only in the resolved host scope and refreshes after success", async () => {
    for (const revision of [0, 3]) expect(await saveHostFaq(id, revision, input, "owned")).toEqual({ ok: true });
    const cleaned = { question: "Where do we park?", answer: "By the gate.", isPublished: false };
    expect(mocks.insert).toHaveBeenCalledWith(id, cleaned, { slug: "owned" });
    expect(mocks.update).toHaveBeenCalledWith(id, 3, cleaned, { slug: "owned" });
    expect(mocks.refresh).toHaveBeenCalledWith("owned"); expect(mocks.revalidate).toHaveBeenCalledWith("/admin/questions");
  });
  it.each(["scope", "insert", "update"] as const)("contains %s failures without database details or false success", async which => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks[which].mockRejectedValue(Error("postgresql://secret"));
    const result = await saveHostFaq(id, which === "update" ? 1 : 0, input);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret"); expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled(); log.mockRestore();
  });
  it.each([0, 2])("reports changed/missing FAQs instead of success at revision %s", async revision => {
    mocks.insert.mockResolvedValue(false); mocks.update.mockResolvedValue(false);
    expect(await saveHostFaq(id, revision, input)).toMatchObject({ ok: false, message: expect.stringContaining("Reload") });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
