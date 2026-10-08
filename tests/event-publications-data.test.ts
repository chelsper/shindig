import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), artwork: vi.fn(), settings: vi.fn(), sql: vi.fn(), head: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.sql }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork, draftImageStorageToken: () => "private-token" }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
import { getEventPublication, getHostEventPublication, getPublishedEvent, listHostPublications, publishEventRecord, changeEventLifecycleRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope, resolveHostEventScope, assertEventScope } from "../lib/server/event-scope";
import { parsePublicationSnapshot } from "../lib/event-publication";
import { draft, eventId, eventSlug, snapshot, versions, publication } from "./fixtures/publication";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DATABASE_URL", "postgresql://test@example.test/db");
  mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft);
  mocks.artwork.mockResolvedValue({ settings: snapshot.artwork, revision: versions.artwork });
  mocks.settings.mockResolvedValue({ settings: snapshot.settings, revision: versions.settings }); mocks.sql.mockResolvedValue([]);
});
describe("public publication boundary", () => {
  it("uses only a scoped attendance aggregate for capacity and returns no private records", async () => {
    mocks.sql.mockResolvedValueOnce([{ ...publication, snapshot: { ...snapshot, settings: { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, capacity: 5 } } } }]).mockResolvedValueOnce([{ total: 5 }]);
    const event = await getPublishedEvent(eventSlug);
    expect(event?.rsvpAvailability).toBe("full");
    expect(mocks.sql.mock.lastCall![0].join("?")).toContain("sum(party_size) FILTER (WHERE attending)");
    expect(mocks.sql.mock.lastCall!.slice(1)).toEqual([eventSlug]);
    expect(mocks.sql.mock.lastCall![0].join("?")).not.toMatch(/guest_name|comment|edit_token|display_on_guest_list/);
    expect(event).not.toHaveProperty("total"); expect(event).not.toHaveProperty("guests");
  });
  it("does not cache deadline state or query attendance after closing", async () => {
    mocks.sql.mockResolvedValue([{ ...publication, snapshot: { ...snapshot, settings: { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, capacity: 5, deadlineAtUtc: "2001-11-01T22:00:00.000Z" } } } }]);
    expect((await getPublishedEvent(eventSlug))?.rsvpAvailability).toBe("deadline");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("never reads mutable drafts or checks host cookies to serve a guest", async () => {
    mocks.sql.mockResolvedValue([publication]);
    const event = await getPublishedEvent(eventSlug); expect(event?.title).toBe("Garden Supper");
    expect(mocks.sql.mock.lastCall![0].join("?")).toContain("FROM event_publications WHERE (slug = ? OR public_alias = ?)");
    expect(mocks.sql.mock.lastCall!.slice(1)).toEqual([eventSlug, eventSlug]);
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
  it.each(["unpublished", "archived"] as const)("excludes %s snapshots from every public resolution but permits authenticated host management", async (visibility) => {
    mocks.sql.mockResolvedValue([{ ...publication, visibility, rsvpsOpen: false }]);
    expect(await getEventPublication(eventSlug)).toBeNull();
    expect(await getPublishedEvent(eventSlug)).toBeNull();
    expect(await resolvePublicEventScope(eventSlug)).toBeNull();
    expect(mocks.sql.mock.lastCall![0].join("?")).toContain("AND visibility = 'published'");
    expect(await getHostEventPublication(eventSlug)).toMatchObject({ visibility, rsvpsOpen: false });
    expect(await resolveHostEventScope(eventSlug)).toMatchObject({ access: "host", slug: eventSlug, rsvpsOpen: false });
  });
  it("keeps a closed event public while projecting the closed RSVP state", async () => {
    mocks.sql.mockResolvedValue([{ ...publication, rsvpsOpen: false }]);
    expect(await getPublishedEvent(eventSlug)).toMatchObject({ title: "Garden Supper", rsvpsOpen: false });
    expect(await resolvePublicEventScope(eventSlug)).toMatchObject({ rsvpsOpen: false, access: "public" });
  });
  it("requires host authentication for inactive snapshots and scopes", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(getHostEventPublication(eventSlug)).rejects.toThrow("Host access");
    await expect(resolveHostEventScope(eventSlug)).rejects.toThrow("Host access");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each([{ visibility: "unknown" }, { visibility: "archived", rsvpsOpen: true }, { rsvpsOpen: "true" }, { sourceRevisions: null }])("fails closed on invalid lifecycle fields %j", async (patch) => {
    mocks.sql.mockResolvedValue([{ ...publication, ...patch }]);
    await expect(getEventPublication(eventSlug)).rejects.toThrow("Invalid publication");
  });
});
describe("host lifecycle writes", () => {
  it.each(["unpublish", "archive", "restore"] as const)("authenticates before %s", async (action) => {
    mocks.auth.mockResolvedValue(false);
    await expect(changeEventLifecycleRecord(eventId, 1, action)).rejects.toThrow("Host access");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN])("rejects invalid reviewed revision %s", async (revision) => {
    await expect(changeEventLifecycleRecord(eventId, revision, "close-rsvps")).rejects.toThrow();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("does not accept the legacy event or an arbitrary operation", async () => {
    await expect(changeEventLifecycleRecord("oyster-roast-2026", 1, "unpublish")).rejects.toThrow();
    await expect(changeEventLifecycleRecord(eventId, 1, "publish" as never)).rejects.toThrow();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each(["close-rsvps", "reopen-rsvps", "unpublish", "archive", "restore"] as const)("sets an explicit %s state with a scoped revision check and no data deletion", async (action) => {
    mocks.sql.mockResolvedValue([{ revision: 2 }]);
    expect(await changeEventLifecycleRecord(eventId, 1, action)).toBe(2);
    const [parts, ...values] = mocks.sql.mock.lastCall!, query = parts.join("?");
    expect(query).toContain("event_id = ?::uuid AND revision = ?");
    expect(query).toContain("revision = revision + 1");
    expect(query).not.toMatch(/DELETE|INSERT|snapshot =|published_at =/);
    expect(query).toContain("IN ('close-rsvps', 'archive', 'restore') THEN false");
    expect(query).toContain("= 'restore' AND visibility = 'archived'");
    expect(query).toContain("= 'reopen-rsvps' AND visibility <> 'archived'");
    expect(values).toContain(eventId); expect(values).toContain(action);
  });
  it("does not report success for stale revisions or missing publications", async () => {
    expect(await changeEventLifecycleRecord(eventId, 1, "close-rsvps")).toBeNull();
  });
  it("shows pending draft changes without treating lifecycle revision changes as new content", async () => {
    mocks.sql.mockResolvedValue([{ id: eventId, slug: eventSlug, title: "Garden Supper", publishedAt: publication.publishedAt, visibility: "unpublished", rsvpsOpen: false, sourceRevisions: versions, details: 2, artwork: 0, settings: 3 }]);
    expect(await listHostPublications()).toEqual([expect.objectContaining({ visibility: "unpublished", rsvpsOpen: false, hasUnpublishedChanges: false })]);
    mocks.sql.mockResolvedValue([{ id: eventId, slug: eventSlug, title: "Garden Supper", publishedAt: publication.publishedAt, sourceRevisions: versions, details: 3, artwork: 0, settings: 3 }]);
    expect((await listHostPublications())[0].hasUnpublishedChanges).toBe(true);
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
    expect(query).toContain("visibility = 'published'"); expect(query).not.toContain("rsvps_open =");
    expect(query).toContain("p.visibility IS DISTINCT FROM 'archived'");
    expect(query).toContain("event_publications.visibility <> 'archived'");
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
  it("does not mistake a lifecycle revision bump for a successful publish retry", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...publication, revision: 2, rsvpsOpen: false }]);
    expect(await publishEventRecord(eventId, { ...versions, publication: 1 }, null)).toBeNull();
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
