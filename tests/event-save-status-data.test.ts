import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ draft: vi.fn(), artwork: vi.fn(), settings: vi.fn(), publication: vi.fn() }));
vi.mock("../lib/server/event-drafts", () => ({ getEventDraft: m.draft }));
vi.mock("../lib/server/event-draft-artwork", () => ({ getDraftArtwork: m.artwork }));
vi.mock("../lib/server/event-draft-settings", () => ({ getDraftSettings: m.settings }));
vi.mock("../lib/server/event-publications", () => ({ getHostEventPublication: m.publication }));
import { getDraftPublicationStatus } from "../lib/server/event-save-status";
import { eventId, eventSlug, draft, snapshot, publication } from "./fixtures/publication";
const versions = { details: draft.revision, artwork: 0, settings: 3 };
beforeEach(() => {
  vi.resetAllMocks(); m.draft.mockResolvedValue(draft); m.artwork.mockResolvedValue({ revision: 0, settings: snapshot.artwork }); m.settings.mockResolvedValue({ revision: 3, settings: snapshot.settings }); m.publication.mockResolvedValue(publication);
});
describe("server-only publication status projection", () => {
  it("returns only visibility and revision comparison, no private snapshot, paths or guests", async () => {
    expect(await getDraftPublicationStatus(eventId)).toEqual({ visibility: "published", hasUnpublishedChanges: false });
    expect(m.publication).toHaveBeenCalledWith(eventSlug);
  });
  it.each(["details", "artwork", "settings"] as const)("recognizes a changed %s revision", async key => {
    expect(await getDraftPublicationStatus(eventId, { ...versions, [key]: versions[key] + 1 })).toEqual({ visibility: "published", hasUnpublishedChanges: true });
  });
  it("reuses authorized route reads without querying them twice", async () => {
    await getDraftPublicationStatus(eventId, versions);
    expect(m.draft).not.toHaveBeenCalled(); expect(m.artwork).not.toHaveBeenCalled(); expect(m.settings).not.toHaveBeenCalled(); expect(m.publication).toHaveBeenCalledOnce();
  });
  it.each(["archived", "unpublished"])("preserves %s rather than calling a matching snapshot live", async visibility => {
    m.publication.mockResolvedValue({ ...publication, visibility });
    expect(await getDraftPublicationStatus(eventId)).toMatchObject({ visibility });
  });
  it("recognizes a never-published draft only after a successful read", async () => {
    m.publication.mockResolvedValue(null);
    expect(await getDraftPublicationStatus(eventId)).toEqual({ visibility: null, hasUnpublishedChanges: true });
  });
  it.each(["draft", "artwork", "settings", "publication"] as const)("never reports live or exposes details after a failed %s read", async key => {
    m[key].mockRejectedValue(new Error("private database details or denied host session"));
    expect(await getDraftPublicationStatus(eventId)).toBeNull();
  });
  it("rejects invalid ids and missing authorized drafts", async () => {
    expect(await getDraftPublicationStatus("invalid")).toBeNull(); expect(m.publication).not.toHaveBeenCalled();
    m.draft.mockResolvedValue(null); expect(await getDraftPublicationStatus(eventId)).toBeNull();
  });
});
