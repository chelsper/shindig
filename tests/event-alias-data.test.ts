import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), artwork: vi.fn(), settings: vi.fn(), sql: vi.fn(), refresh: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.sql }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork, draftImageStorageToken: () => null }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { getPublishedEvent, getEventPublication, isEventAliasAvailable, publishEventRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope } from "../lib/server/event-scope";
import { guestHubPath } from "../lib/server/guest-event";
import { checkEventLink, publishEvent } from "../app/admin/events/[id]/publish/actions";
import { draft, eventId, eventSlug, snapshot, versions, publication } from "./fixtures/publication";
const aliased = { ...publication, publicAlias: "garden-supper" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://test@example.test/db"); mocks.auth.mockResolvedValue(true);
  mocks.draft.mockResolvedValue(draft); mocks.artwork.mockResolvedValue({ settings: snapshot.artwork, revision: versions.artwork });
  mocks.settings.mockResolvedValue({ settings: snapshot.settings, revision: versions.settings }); mocks.sql.mockResolvedValue([]);
});
describe("alias lookup and availability boundaries", () => {
  it.each([eventSlug, "garden-supper"])("resolves %s to exactly the same permanent data scope", async (input) => {
    mocks.sql.mockResolvedValue([aliased]);
    expect(await getPublishedEvent(input)).toMatchObject({ slug: eventSlug, websiteUrl: "https://www.haveashindig.com/e/garden-supper" });
    const scope = (await resolvePublicEventScope(input))!; expect(scope.slug).toBe(eventSlug); expect(guestHubPath(scope)).toBe("/e/garden-supper/event");
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.draft).not.toHaveBeenCalled();
  });
  it.each(["unpublished", "archived"] as const)("never resolves a %s alias publicly", async (visibility) => {
    mocks.sql.mockResolvedValue([{ ...aliased, visibility, rsvpsOpen: false }]);
    expect(await getPublishedEvent("garden-supper")).toBeNull(); expect(await resolvePublicEventScope("garden-supper")).toBeNull();
    expect(mocks.sql.mock.lastCall![0].join("?")).toContain("AND visibility = 'published'");
  });
  it.each([{ publicAlias: "admin" }, { publicAlias: "OTHER" }, { publicAlias: "other-event" }, { slug: "event-not-the-correct-id" }])("rejects malformed or mismatched stored aliases: %j", async (patch) => {
    mocks.sql.mockResolvedValue([{ ...aliased, ...patch }]); await expect(getEventPublication("garden-supper")).rejects.toThrow("Invalid publication");
  });
  it("requires authentication for availability and returns no private event details", async () => {
    mocks.auth.mockResolvedValue(false); expect((await checkEventLink(eventId, "garden-supper")).ok).toBe(false);
    expect(mocks.sql).not.toHaveBeenCalled(); expect(mocks.draft).not.toHaveBeenCalled();
  });
  it("checks the full namespace, including names kept by archived events", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await checkEventLink(eventId, "garden-supper")).toEqual({ ok: true, available: false });
    const sql = mocks.sql.mock.lastCall![0].join("?"); expect(sql).toContain("public_alias = ?"); expect(sql).not.toContain("visibility");
  });
  it("allows available names without reserving them or writing anything", async () => {
    expect(await checkEventLink(eventId, "garden-supper")).toEqual({ ok: true, available: true });
    expect(mocks.sql.mock.calls.every(([parts]) => !/INSERT|UPDATE|DELETE/.test(parts.join("?")))).toBe(true);
  });
  it("refuses link changes after publication and handles database failures safely", async () => {
    mocks.sql.mockResolvedValue([aliased]); await expect(isEventAliasAvailable(eventId, "changed-link")).rejects.toThrow("already fixed");
    mocks.sql.mockRejectedValue(new Error("postgresql://secret"));
    const result = await checkEventLink(eventId, "garden-supper"); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret");
  });
});
describe("atomic alias publication", () => {
  it("validates server-side before reading draft data", async () => {
    expect((await publishEvent(eventId, versions, null, true, "admin")).ok).toBe(false); expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("requires publication confirmation independently of availability", async () => {
    expect((await publishEvent(eventId, versions, null, false, "garden-supper")).ok).toBe(false); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("uses a parameterized alias and guards the immutable existing value", async () => {
    mocks.sql.mockResolvedValue([{ revision: 1 }]); expect(await publishEventRecord(eventId, versions, null, "  Garden-Supper ")).toBe(1);
    const [parts, ...values] = mocks.sql.mock.lastCall!, sql = parts.join("?");
    expect(values).toContain("garden-supper"); expect(sql).not.toContain("garden-supper"); expect(sql).toContain("p.public_alias IS NOT DISTINCT FROM ?"); expect(sql.slice(sql.indexOf("ON CONFLICT"))).not.toContain("public_alias =");
  });
  it("returns a friendly name-collision error and never reports success", async () => {
    mocks.sql.mockRejectedValue({ code: "23505", constraint: "event_publications_public_alias_key", message: "secret details" });
    const result = await publishEvent(eventId, versions, null, true, "garden-supper");
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("link was just taken") }); expect(mocks.refresh).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("acknowledges only the same alias after a lost-response retry", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([aliased]); expect(await publishEventRecord(eventId, versions, null, "garden-supper")).toBe(1);
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([aliased]); expect(await publishEventRecord(eventId, versions, null, "another-name")).toBeNull();
  });
});
