import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ auth: true, query: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.auth }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => state.query }));
import { listHostEventCards } from "../lib/server/event-dashboard";
import { draft, snapshot, eventId, otherEventId } from "./fixtures/publication";

const row = () => ({
  ...draft, location: null, artwork: snapshot.artwork, settingsId: eventId,
  ...snapshot.settings.rsvp, deadlineAtUtc: null, capacity: null, features: snapshot.settings.features,
  publicationId: eventId, snapshot, visibility: "published", rsvpsOpen: true, publicAlias: "garden-supper",
});
beforeEach(() => { state.auth = true; state.query.mockReset(); vi.stubEnv("DATABASE_URL", "postgresql://synthetic@localhost/dashboard_test"); });
afterEach(() => vi.unstubAllEnvs());

describe("host-only unified event dashboard data", () => {
  it("returns one card per joined event, using one read and no guest queries or writes", async () => {
    state.query.mockResolvedValue([row()]);
    const cards = await listHostEventCards();
    expect(cards).toHaveLength(1); expect(state.query).toHaveBeenCalledTimes(1);
    const sql = state.query.mock.calls[0][0].join("?");
    expect(sql).toContain("FROM events e"); expect(sql).toContain("LEFT JOIN event_publications");
    expect(sql).toContain("LEFT JOIN event_draft_settings"); expect(sql).toContain("e.id");
    expect(sql).not.toMatch(/INSERT|UPDATE |DELETE|FROM rsvps|JOIN rsvps/);
    expect(cards[0]).toMatchObject({ status: "published", title: draft.title, publicHref: "/e/garden-supper", shareHref: `/admin/events/${eventId}/publish#share-event`, hasUnpublishedChanges: false });
    expect(cards[0].dateLabel).toContain("5:00 PM PST");
  });
  it("authenticates before touching the database, even when its URL is missing", async () => {
    state.auth = false; vi.stubEnv("DATABASE_URL", "");
    await expect(listHostEventCards()).rejects.toThrow("Host access");
    expect(state.query).not.toHaveBeenCalled();
  });
  it("does not cache authenticated event lists between calls", async () => {
    state.query.mockResolvedValue([row()]); await listHostEventCards();
    state.query.mockResolvedValue([]); expect(await listHostEventCards()).toEqual([]);
    expect(state.query).toHaveBeenCalledTimes(2);
  });
  it("keeps live identity/artwork until publishing while indicating changed saved values", async () => {
    const image = `event-drafts/${eventId}/invitation/${otherEventId}.png`;
    const old = { ...snapshot, artwork: { ...snapshot.artwork, invitation: { path: image, alt: "Published picture" } } };
    state.query.mockResolvedValue([{ ...row(), title: "Private new name", startsAtUtc: "2026-11-09T01:00:00.000Z", endsAtUtc: "2026-11-09T04:00:00.000Z", snapshot: old }]);
    const [card] = await listHostEventCards();
    expect(card).toMatchObject({ title: draft.title, draftTitle: "Private new name", hasUnpublishedChanges: true, image: { alt: "Published picture" } });
    expect(card.dateLabel).toContain("Nov 7"); expect(card.image?.src).toContain("/artwork/image?path=");
    expect(card.image?.src).toContain(encodeURIComponent(image));
  });
  it("ignores revision-only resaves but recognizes RSVP, Hub, location and design edits", async () => {
    state.query.mockResolvedValue([{ ...row(), revision: 55 }]);
    expect((await listHostEventCards())[0].hasUnpublishedChanges).toBe(false);
    for (const edits of [{ maxPartySize: 8 }, { features: { ...snapshot.settings.features, playlist: false } }, { address: "A new place" }, { artwork: { ...snapshot.artwork, design: { style: "coastal", invitationCrop: { x: 50, y: 50, zoom: 100 } } } }]) {
      state.query.mockResolvedValue([{ ...row(), ...edits }]);
      expect((await listHostEventCards())[0].hasUnpublishedChanges).toBe(true);
    }
  });
  it.each(["unpublished", "archived"])("keeps guest management but removes public and share paths for %s", async (visibility) => {
    state.query.mockResolvedValue([{ ...row(), visibility, rsvpsOpen: false }]);
    const [card] = await listHostEventCards();
    expect(card.status).toBe(visibility); expect(card.publicHref).toBeNull(); expect(card.shareHref).toBeNull();
    expect(card.guestsHref).toBe(`/admin/events/${eventId}/guests`); expect(card.reviewHref).toContain("/publish");
  });
  it("includes unfinished drafts even without settings or artwork rows", async () => {
    state.query.mockResolvedValue([{ ...row(), publicationId: null, snapshot: null, visibility: null, rsvpsOpen: null, publicAlias: null, settingsId: null, artwork: null, title: "Private idea", startsAtUtc: null, endsAtUtc: null }]);
    expect((await listHostEventCards())[0]).toMatchObject({ title: "Private idea", status: "draft", image: null, dateLabel: "Date to be decided", publicHref: null, shareHref: null, guestsHref: null, hasUnpublishedChanges: false });
  });
  it("uses a draft's saved invitation or header-only artwork via the protected image route", async () => {
    const image = `event-drafts/${eventId}/header/${otherEventId}.png`;
    state.query.mockResolvedValue([{ ...row(), publicationId: null, publicAlias: null, artwork: { ...snapshot.artwork, header: { ...snapshot.artwork.header, path: image, alt: "Private header" } } }]);
    expect((await listHostEventCards())[0].image).toEqual({ src: `/admin/events/${eventId}/artwork/image?path=${encodeURIComponent(image)}`, alt: "Private header" });
  });
  it("allows an address change with cleared location to be reviewed without needing a publishable draft", async () => {
    const old = { ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, weather: true } }, coordinates: { latitude: 30, longitude: -81 } };
    state.query.mockResolvedValue([{ ...row(), snapshot: old, features: old.settings.features, address: "Changed address", location: null }]);
    expect((await listHostEventCards())[0].hasUnpublishedChanges).toBe(true);
  });
  it("projects only summary values; never sends full snapshots, addresses or guest data", async () => {
    state.query.mockResolvedValue([{ ...row(), guestName: "PRIVATE GUEST", comment: "PRIVATE COMMENT", token: "PRIVATE TOKEN" }]);
    const serialized = JSON.stringify(await listHostEventCards());
    for (const secret of ["PRIVATE", "snapshot", "description", "sourceRevisions", "location_confirmation", draft.address, "postgresql"]) expect(serialized).not.toContain(secret);
  });
  it.each([{ visibility: "unknown" }, { visibility: "archived", rsvpsOpen: true }, { publicAlias: "https://evil.test" }, { id: "bad" }, { timeZone: "bad" }, { snapshot: null }, { artwork: { invitation: { path: "https://evil.test" } } }])("fails closed on corrupt stored data %j", async (edits) => {
    state.query.mockResolvedValue([{ ...row(), ...edits }]);
    await expect(listHostEventCards()).rejects.toThrow();
  });
});
