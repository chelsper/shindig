vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), artwork: vi.fn(), settings: vi.fn(), publication: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: mocks.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: mocks.artwork }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: mocks.settings }));
vi.mock("../lib/server/event-publications", () => ({ getHostEventPublication: mocks.publication }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
import Page, { metadata, dynamic } from "../app/admin/events/[id]/setup/page";
import { draft, snapshot, eventId as id, publication } from "./fixtures/publication";

const props = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.draft.mockResolvedValue(draft);
  mocks.artwork.mockResolvedValue({ settings: snapshot.artwork, revision: 0 });
  mocks.settings.mockResolvedValue({ settings: snapshot.settings, revision: 3 });
  mocks.publication.mockResolvedValue(null);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); mocks.notFound.mockImplementation(() => { throw new Error("not found"); });
});

describe("authenticated event setup route", () => {
  it("authenticates before any reads and disables indexing/static generation", async () => {
    mocks.auth.mockResolvedValue(false);
    await expect(Page(props)).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/host/sign-in");
    for (const fn of [mocks.draft, mocks.artwork, mocks.settings, mocks.publication]) expect(fn).not.toHaveBeenCalled();
    expect(dynamic).toBe("force-dynamic"); expect(metadata.robots).toEqual({ index: false, follow: false }); expect(metadata.referrer).toBe("no-referrer");
  });
  it("checks malformed IDs before reading, and resolves only the requested event", async () => {
    await expect(Page({ params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("not found");
    for (const fn of [mocks.draft, mocks.artwork, mocks.settings, mocks.publication]) expect(fn).not.toHaveBeenCalled();
    await Page(props);
    for (const fn of [mocks.draft, mocks.artwork, mocks.settings]) expect(fn).toHaveBeenCalledWith(id);
    expect(mocks.publication).toHaveBeenCalledWith(`event-${id}`);
  });
  it.each(["draft", "artwork", "settings"] as const)("returns not-found for missing %s rather than borrowed defaults", async (key) => {
    mocks[key].mockResolvedValue(null);
    await expect(Page(props)).rejects.toThrow("not found");
  });
  it.each(["draft", "artwork", "settings", "publication"] as const)("does not mistake a %s failure for a ready or unpublished event", async (key) => {
    mocks[key].mockRejectedValue(new Error("postgresql://private-secret"));
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain("Setup is temporarily unavailable"); expect(html).toContain("Try again");
    expect(html).not.toMatch(/private-secret|Ready|Get links|Event setup checklist|Garden Supper/);
  });
  it("shows saved confirmation only for the exact creation return parameter", async () => {
    expect(renderToStaticMarkup(await Page({ ...props, searchParams: Promise.resolve({ saved: "1" }) }))).toContain("Draft saved privately");
    expect(renderToStaticMarkup(await Page({ ...props, searchParams: Promise.resolve({ saved: ["1"] }) }))).not.toContain("Draft saved privately");
  });
  it("shows copied confirmation only for an unpublished new draft and exact return parameter", async () => {
    expect(renderToStaticMarkup(await Page({ ...props, searchParams: Promise.resolve({ copied: "1" }) }))).toContain("Your new private copy is ready");
    expect(renderToStaticMarkup(await Page({ ...props, searchParams: Promise.resolve({ copied: ["1"] }) }))).not.toContain("Your new private copy is ready");
    mocks.publication.mockResolvedValue(publication);
    expect(renderToStaticMarkup(await Page({ ...props, searchParams: Promise.resolve({ copied: "1" }) }))).not.toContain("Your new private copy is ready");
  });
  it("calculates whether edits differ from the publication using stored revisions", async () => {
    mocks.publication.mockResolvedValue(publication);
    expect(renderToStaticMarkup(await Page(props))).toContain("matches the live version");
    mocks.draft.mockResolvedValue({ ...draft, revision: draft.revision + 1 });
    expect(renderToStaticMarkup(await Page(props))).toContain("Unpublished changes");
  });
  it("requires weather reconfirmation for an address changed since publication", async () => {
    const settings = { ...snapshot.settings, features: { ...snapshot.settings.features, weather: true } };
    mocks.settings.mockResolvedValue({ settings, revision: 3 });
    mocks.publication.mockResolvedValue({ ...publication, snapshot: { ...snapshot, settings, coordinates: { latitude: 30, longitude: -81 } } });
    mocks.draft.mockResolvedValue({ ...draft, location: { address: draft.address, matchedAddress: draft.address, latitude: 30, longitude: -81, source: "published" } });
    expect(renderToStaticMarkup(await Page(props))).not.toContain("Confirm the event’s weather location");
    mocks.draft.mockResolvedValue({ ...draft, address: "A new address", revision: 3 });
    expect(renderToStaticMarkup(await Page(props))).toContain("Confirm the event’s weather location");
  });
});
