import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ pub: vi.fn(), event: vi.fn(), blob: vi.fn(), auth: vi.fn(), guest: vi.fn(), list: vi.fn(), save: vi.fn(), revalidate: vi.fn(), search: vi.fn(), throttle: vi.fn(), weather: vi.fn(), typical: vi.fn(), draft: vi.fn(), artwork: vi.fn(), settings: vi.fn() }));
vi.mock("../lib/server/event-publications", () => ({ getEventPublication: mocks.pub, getHostEventPublication: mocks.pub, getPublishedEvent: mocks.event, publishEventRecord: mocks.save }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork, draftImageStorageToken: () => "private-storage-token" }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
vi.mock("../lib/server/rsvps", () => ({ getRsvpForGuest: mocks.guest, listRsvps: mocks.list }));
vi.mock("@vercel/blob", () => ({ get: mocks.blob }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); }, redirect: (url: string) => { throw new Error(`redirect:${url}`); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../app/actions", () => ({ submitRsvp: vi.fn() }));
vi.mock("../app/e/actions", () => ({ submitEventRsvp: vi.fn(), updateEventRsvp: vi.fn() }));
vi.mock("../app/rsvp/actions", () => ({ updateRsvp: vi.fn() }));
vi.mock("../lib/server/music", () => ({ searchMusic: mocks.search, isMusicSearchConfigured: () => true }));
vi.mock("../lib/server/music/rate-limit", () => ({ throttleMusicRequest: mocks.throttle }));
vi.mock("../lib/server/weather", () => ({ eventWeatherService: { live: mocks.weather, typical: mocks.typical } }));
import Invitation from "../app/e/[slug]/page";
import Hub from "../app/e/[slug]/event/page";
import Edit from "../app/e/[slug]/rsvp/[token]/page";
import PublishPage from "../app/admin/events/[id]/publish/page";
import Guests from "../app/admin/events/[id]/guests/page";
import { publishEvent } from "../app/admin/events/[id]/publish/actions";
import { GET as artwork } from "../app/e/[slug]/artwork/[kind]/route";
import { GET as calendar } from "../app/e/[slug]/calendar.ics/route";
import { GET as exportCsv } from "../app/admin/events/[id]/guests/export/route";
import { GET as music } from "../app/api/music/search/route";
import { GET as weather } from "../app/api/weather/route";
import { publicationEvent } from "../lib/event-publication";
import { publication, snapshot, eventSlug, eventId, draft, versions } from "./fixtures/publication";
const token = "a".repeat(43), event = publicationEvent(eventId, snapshot);
const context = { params: Promise.resolve({ slug: eventSlug }) };
const adminContext = { params: Promise.resolve({ id: eventId }), searchParams: Promise.resolve({}) };
const request = (path: string) => new Request(`https://www.haveashindig.com${path}`);
beforeEach(() => {
  vi.resetAllMocks(); mocks.pub.mockResolvedValue(publication); mocks.event.mockResolvedValue(event); mocks.auth.mockResolvedValue(true);
  mocks.draft.mockResolvedValue(draft); mocks.artwork.mockResolvedValue({ settings: snapshot.artwork, revision: 0 }); mocks.settings.mockResolvedValue({ settings: snapshot.settings, revision: 3 });
  mocks.list.mockResolvedValue([]); mocks.search.mockResolvedValue({ tracks: [], attribution: {} }); mocks.save.mockResolvedValue(1);
});
describe("published routes", () => {
  it("renders only the resolved event and preserves the two legacy aliases", async () => {
    expect(renderToStaticMarkup(await Invitation(context))).toContain("Garden Supper");
    const hub = await Hub(context); expect(hub.props.event.slug).toBe(eventSlug); expect(hub.props.scope.slug).toBe(eventSlug);
    const legacy = { params: Promise.resolve({ slug: "oyster-roast-2026" }) };
    await expect(Invitation(legacy)).rejects.toThrow("redirect:/invitation"); await expect(Hub(legacy)).rejects.toThrow("redirect:/event");
  });
  it("returns unavailable/404 for unpublished routes, never draft fallback even for hosts", async () => {
    mocks.event.mockResolvedValue(null); mocks.pub.mockResolvedValue(null);
    for (const page of [Invitation, Hub]) await expect(page(context)).rejects.toThrow("not-found");
    await expect(Edit({ params: Promise.resolve({ slug: eventSlug, token }) })).rejects.toThrow("not-found");
    expect(mocks.guest).not.toHaveBeenCalled();
    expect((await calendar(request("/calendar"), context)).status).toBe(404);
    expect((await artwork(request("/image"), { params: Promise.resolve({ slug: eventSlug, kind: "invitation" }) })).status).toBe(404);
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.blob).not.toHaveBeenCalled();
  });
  it("keeps CSV export host-only and available for a previously published private event", async () => {
    mocks.pub.mockResolvedValue({ ...publication, visibility: "unpublished", rsvpsOpen: false });
    const result = await exportCsv(request("/export"), adminContext);
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.list.mock.lastCall![1]).toMatchObject({ slug: eventSlug, access: "host" });
    mocks.auth.mockResolvedValue(false); mocks.list.mockClear();
    expect((await exportCsv(request("/export"), adminContext)).status).toBe(401); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("fails gracefully without leaking database details or showing a different event", async () => {
    mocks.event.mockRejectedValue(new Error("postgresql://private"));
    const html = renderToStaticMarkup(await Invitation(context)); expect(html).not.toContain("postgresql"); expect(html).not.toContain("Garden Supper");
    expect((await calendar(request("/calendar"), context)).status).toBe(503);
  });
  it("streams only the snapshot's approved artwork, ignoring arbitrary path parameters", async () => {
    const path = `event-drafts/${eventId}/invitation/7ac5edab-22aa-447d-8931-91132a16798a.png`;
    mocks.pub.mockResolvedValue({ ...publication, snapshot: { ...snapshot, artwork: { ...snapshot.artwork, invitation: { path, alt: "Approved" } } } });
    mocks.blob.mockResolvedValue({ statusCode: 200, blob: { size: 3, contentType: "image/png" }, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1,2,3])); c.close(); } }) });
    const result = await artwork(request("/image?path=event-drafts/another/private.png"), { params: Promise.resolve({ slug: eventSlug, kind: "header" }) });
    expect(result.status).toBe(200); expect(mocks.blob).toHaveBeenCalledWith(path, { access: "private", token: "private-storage-token" });
    expect(result.headers.get("Cache-Control")).toContain("no-store"); expect(result.headers.get("Content-Type")).toBe("image/png");
  });
  it("rejects arbitrary artwork roles before reading storage", async () => {
    expect((await artwork(request("/image"), { params: Promise.resolve({ slug: eventSlug, kind: "../../secret" }) })).status).toBe(404);
    expect(mocks.pub).not.toHaveBeenCalled(); expect(mocks.blob).not.toHaveBeenCalled();
  });
  it("builds event-local calendar content with scoped Hub and private RSVP URLs", async () => {
    const response = await calendar(request(`/calendar?token=${token}`), context);
    const ics = (await response.text()).replace(/\r\n /g, "");
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(ics).toContain(`/e/${eventSlug}/rsvp/${token}`); expect(ics).toContain(`/e/${eventSlug}/event`); expect(ics).not.toContain("jaspershucks");
  });
  it("uses the alias for navigation but the stable identity for guest authorization", async () => {
    const slug = "garden-supper", aliased = { params: Promise.resolve({ slug }) };
    mocks.pub.mockResolvedValue({ ...publication, publicAlias: slug });
    mocks.event.mockResolvedValue(publicationEvent(eventId, snapshot, true, slug));
    const html = renderToStaticMarkup(await Invitation(aliased));
    expect(html).toContain(`/e/${slug}/event`);
    const hub = await Hub(aliased);
    expect(hub.props.event.slug).toBe(eventSlug); expect(hub.props.scope.slug).toBe(eventSlug);
    mocks.guest.mockResolvedValue(null);
    await Edit({ params: Promise.resolve({ slug, token }) });
    expect(mocks.guest.mock.lastCall![1].slug).toBe(eventSlug);
    const ics = (await (await calendar(request(`/calendar?token=${token}`), aliased)).text()).replace(/\r\n /g, "");
    expect(ics).toContain(`/e/${slug}/rsvp/${token}`); expect(ics).toContain(`/e/${slug}/event`);
    expect(ics).toContain(`UID:${event.calendarUid}`);
  });
  it("closes every public alias route without a published resolution", async () => {
    const slug = "garden-supper", aliased = { params: Promise.resolve({ slug }) };
    mocks.event.mockResolvedValue(null); mocks.pub.mockResolvedValue(null);
    for (const page of [Invitation, Hub]) await expect(page(aliased)).rejects.toThrow("not-found");
    await expect(Edit({ params: Promise.resolve({ slug, token }) })).rejects.toThrow("not-found");
    expect((await calendar(request("/calendar"), aliased)).status).toBe(404);
    expect((await artwork(request("/image"), { params: Promise.resolve({ slug, kind: "invitation" }) })).status).toBe(404);
    expect((await music(request(`/api/music/search?q=hello&event=${slug}`))).status).toBe(404);
    expect((await weather(request(`/api/weather?event=${slug}`))).status).toBe(404);
    for (const fn of [mocks.guest, mocks.blob, mocks.search, mocks.weather, mocks.draft]) expect(fn).not.toHaveBeenCalled();
  });
  it("loads an edit token only within its event, and does not show another guest on a miss", async () => {
    mocks.guest.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Edit({ params: Promise.resolve({ slug: eventSlug, token }) }));
    expect(html).toContain("isn’t available"); expect(mocks.guest.mock.lastCall![1].slug).toBe(eventSlug);
    expect(mocks.guest.mock.lastCall![0]).toMatch(/^[a-f0-9]{64}$/); expect(html).not.toContain("Guest name");
  });
});
describe("scoped providers and host screens", () => {
  it("searches only when the resolved event enables the playlist", async () => {
    expect((await music(request(`/api/music/search?q=hello&event=${eventSlug}`))).status).toBe(200);
    mocks.pub.mockResolvedValue(null); mocks.search.mockClear();
    expect((await music(request(`/api/music/search?q=hello&event=${eventSlug}`))).status).toBe(404); expect(mocks.search).not.toHaveBeenCalled();
  });
  it("uses only published weather coordinates and refuses disabled weather", async () => {
    expect((await weather(request(`/api/weather?event=${eventSlug}`))).status).toBe(404); expect(mocks.weather).not.toHaveBeenCalled();
    const located = { ...event, features: { ...event.features, weather: true }, coordinates: { latitude: 37.7, longitude: -122.4 } };
    mocks.event.mockResolvedValue(located); mocks.weather.mockResolvedValue({ current: null });
    expect((await weather(request(`/api/weather?event=${eventSlug}&latitude=0&longitude=0`))).status).toBe(200);
    expect(mocks.weather).toHaveBeenCalledWith(located);
  });
  it("protects review, event response pages and CSV before event reads", async () => {
    mocks.auth.mockResolvedValue(false);
    for (const page of [PublishPage, Guests]) await expect(page(adminContext)).rejects.toThrow("redirect:/admin");
    expect((await exportCsv(request("/export"), adminContext)).status).toBe(401);
    for (const fn of [mocks.event, mocks.pub, mocks.draft, mocks.artwork, mocks.settings, mocks.list]) expect(fn).not.toHaveBeenCalled();
  });
  it("requires confirmation and returns conflicts/failures without success or secret exposure", async () => {
    expect((await publishEvent(eventId, versions, null, false)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
    mocks.save.mockResolvedValue(null); expect((await publishEvent(eventId, versions, null, true)).ok).toBe(false); expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.save.mockRejectedValue(new Error("private secret")); const failure = await publishEvent(eventId, versions, null, true);
    expect(failure.ok).toBe(false); expect(JSON.stringify(failure)).not.toContain("secret");
  });
  it("refreshes only this event's guest routes and host list after explicit publication", async () => {
    expect((await publishEvent(eventId, versions, null, true)).ok).toBe(true);
    const paths = mocks.revalidate.mock.calls.flat(); expect(paths).toContain(`/e/${eventSlug}`); expect(paths).toContain(`/e/${eventSlug}/event`); expect(paths).not.toContain("/event"); expect(paths).not.toContain("/");
  });
  it("does not claim an event stayed private when post-publication refresh fails", async () => {
    mocks.pub.mockRejectedValue(new Error("Database read failed"));
    const result = await publishEvent(eventId, versions, null, true, "garden-supper");
    expect(result.ok).toBe(false); expect(mocks.save).toHaveBeenCalled();
    if (!result.ok) { expect(result.message).toContain("couldn’t be confirmed"); expect(result.message).toContain("check the current status"); expect(result.message).not.toContain("Nothing was automatically made public"); }
  });
});
