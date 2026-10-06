import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), artwork: vi.fn(), settings: vi.fn(), sql: vi.fn(), head: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.sql }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork, draftImageStorageToken: () => "private-token" }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
import { getEventPublication, getPublishedEvent, listHostPublications, publishEventRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope, assertEventScope } from "../lib/server/event-scope";
import { parsePublicationSnapshot } from "../lib/event-publication";
import { draft, eventId, eventSlug, snapshot, versions, publication } from "./fixtures/publication";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://test@example.test/db");
  mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft);
  mocks.artwork.mockResolvedValue({ settings: snapshot.artwork, revision: versions.artwork });
  mocks.settings.mockResolvedValue({ settings: snapshot.settings, revision: versions.settings }); mocks.sql.mockResolvedValue([]);
});
describe("public publication boundary", () => {
  it("never reads mutable drafts or checks host cookies to serve a guest", async () => {
    mocks.sql.mockResolvedValue([publication]);
    const event = await getPublishedEvent(eventSlug); expect(event?.title).toBe("Garden Supper");
    expect(mocks.sql.mock.lastCall![0].join("?")).toContain("FROM event_publications WHERE slug = ?");
    expect(mocks.sql.mock.lastCall!.slice(1)).toEqual([eventSlug]);
    for (const fn of [mocks.auth, mocks.draft, mocks.artwork, mocks.settings]) expect(fn).not.toHaveBeenCalled();
  });
  it("returns nothing for unknown, unpublished, malformed or missing database", async () => {
    for (const slug of [eventSlug, "", "../admin", "EVENT-" + eventId, "event-not-a-uuid"]) expect(await getEventPublication(slug)).toBeNull();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
    vi.stubEnv("DATABASE_URL", ""); expect(await getEventPublication(eventSlug)).toBeNull(); expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("issues a genuine public scope with saved rules and flags, not draft defaults", async () => {
    mocks.sql.mockResolvedValue([publication]);
    const scope = await resolvePublicEventScope(eventSlug);
    expect(scope?.rsvp.maxPartySize).toBe(4); expect(scope?.features.weather).toBe(false); expect(scope?.access).toBe("public");
    expect(() => assertEventScope(scope!)).not.toThrow();
  });
  it("fails closed for malformed storage records and does not replace failures with Oyster Roast", async () => {
    mocks.sql.mockResolvedValue([{ ...publication, snapshot: { ...snapshot, details: { ...draft, address: "" } } }]);
    await expect(getPublishedEvent(eventSlug)).rejects.toThrow();
    mocks.sql.mockRejectedValue(new Error("database-down")); await expect(getPublishedEvent(eventSlug)).rejects.toThrow();
  });
});
describe("explicit host publishing", () => {
  it("requires host authentication before private reads, artwork checks or writes", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(publishEventRecord(eventId, versions, null)).rejects.toThrow("Host access");
    await expect(listHostPublications()).rejects.toThrow("Host access");
    for (const fn of [mocks.draft, mocks.artwork, mocks.settings, mocks.sql, mocks.head]) expect(fn).not.toHaveBeenCalled();
  });
  it.each(["details", "artwork", "settings"] as const)("rejects stale reviewed %s before writing", async (key) => {
    expect(await publishEventRecord(eventId, { ...versions, [key]: versions[key] + 1 }, null)).toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("requires saved settings and complete details", async () => {
    await expect(publishEventRecord(eventId, { ...versions, settings: 0 }, null)).rejects.toThrow();
    mocks.draft.mockResolvedValue({ ...draft, endsAtUtc: null });
    await expect(publishEventRecord(eventId, versions, null)).rejects.toThrow(); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("atomically compares all reviewed revisions and the previous publication", async () => {
    mocks.sql.mockResolvedValue([{ revision: 1 }]);
    expect(await publishEventRecord(eventId, versions, null)).toBe(1);
    const [strings, ...values] = mocks.sql.mock.lastCall!;
    const query = strings.join("?");
    for (const text of ["e.revision = ?", "s.revision = ?", "coalesce(a.revision, 0) = ?", "coalesce(p.revision, 0) = ?", "ON CONFLICT (event_id)", "WHERE event_publications.revision = ?"]) expect(query).toContain(text);
    const stored = JSON.parse(values[1]); expect(stored).toEqual(parsePublicationSnapshot(eventId, snapshot)); expect(stored.details.id).toBeUndefined();
    expect(values).toContain(eventSlug); expect(values).not.toContain("oyster-roast-2026");
  });
  it("acknowledges identical lost-response retries without creating another publication", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([publication]);
    expect(await publishEventRecord(eventId, versions, null)).toBe(1);
  });
  it("never overwrites a newer or different published version on retry", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...publication, revision: 2 }]);
    expect(await publishEventRecord(eventId, versions, null)).toBeNull();
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...publication, snapshot: { ...snapshot, details: { ...draft, title: "Other version" } } }]);
    expect(await publishEventRecord(eventId, versions, null)).toBeNull();
  });
  it("checks only saved private artwork and refuses unavailable/foreign images", async () => {
    const path = `event-drafts/${eventId}/invitation/7ac5edab-22aa-447d-8931-91132a16798a.png`;
    mocks.artwork.mockResolvedValue({ settings: { ...snapshot.artwork, invitation: { path, alt: "Garden" } }, revision: 1 });
    mocks.head.mockResolvedValue({ pathname: path, url: "https://store.private.blob.vercel-storage.com/image", size: 500, contentType: "image/png" });
    mocks.sql.mockResolvedValue([{ revision: 1 }]);
    expect(await publishEventRecord(eventId, { ...versions, artwork: 1 }, null)).toBe(1);
    expect(mocks.head).toHaveBeenCalledWith(path, { token: "private-token" });
    mocks.sql.mockClear(); mocks.head.mockRejectedValue(new Error("Missing image"));
    await expect(publishEventRecord(eventId, { ...versions, artwork: 1 }, null)).rejects.toThrow(); expect(mocks.sql).not.toHaveBeenCalled();
  });
});
