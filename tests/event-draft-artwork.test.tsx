import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_DRAFT_ARTWORK, draftImageUrl, isDraftImagePath, validateDraftArtwork } from "../lib/event-draft-artwork";
import { EMPTY_EVENT_DRAFT, type EventDraft } from "../lib/event-drafts";
import { EventDraftPreview } from "../components/admin/event-draft-preview";

const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const other = "30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6";
const path = `event-drafts/${id}/invitation/${other}.png`;
const headerPath = `event-drafts/${id}/header/${other}.jpg`;
const artwork = { invitation: { path, alt: "  A garden party  " }, header: { ...EMPTY_DRAFT_ARTWORK.header, path: headerPath, alt: "The garden" } };
const draft: EventDraft = { ...EMPTY_EVENT_DRAFT, id, status: "draft", title: "Private birthday", revision: 1, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };

describe("draft artwork validation and previews", () => {
  it("supports an empty private draft and trims accessible descriptions", () => {
    expect(validateDraftArtwork(id, EMPTY_DRAFT_ARTWORK)).toEqual({ ok: true, settings: EMPTY_DRAFT_ARTWORK });
    expect(validateDraftArtwork(id, { ...artwork, secret: "ignored" })).toEqual({ ok: true, settings: { ...artwork, invitation: { path, alt: "A garden party" } } });
  });
  it.each(["https://evil.test/image.png", "https://test.public.blob.vercel-storage.com/image.png", `event-drafts/${other}/invitation/${other}.png`, `event-drafts/${id}/invitation/../${other}.png`, `event-drafts/${id}/invitation/${other}.svg`, `${path}?token=secret`, `${path}/`, "", null])("rejects unsafe, cross-draft or malformed paths: %s", (value) => {
    expect(isDraftImagePath(id, value)).toBe(false);
  });
  it("keeps invitation and header slots distinct", () => {
    expect(isDraftImagePath(id, path, "invitation")).toBe(true);
    expect(isDraftImagePath(id, path, "header")).toBe(false);
    expect(validateDraftArtwork(id, { ...artwork, header: { ...artwork.header, path } }).ok).toBe(false);
  });
  it.each(["", " ", "x".repeat(181), "bad\u0000text", "bad\ntext"])("requires a valid description on uploaded images: %s", (alt) => {
    expect(validateDraftArtwork(id, { ...artwork, invitation: { path, alt } }).ok).toBe(false);
  });
  it.each([{ focalX: -1 }, { focalY: 101 }, { zoomPercent: 99 }, { zoomPercent: 201 }, { focalX: 0.5 }, { focalX: "50" }, { zoomPercent: null }])("rejects malformed crop settings %j", (patch) => {
    expect(validateDraftArtwork(id, { ...artwork, header: { ...artwork.header, ...patch } }).ok).toBe(false);
  });
  it("uses only authenticated image routes and event-local times in a noninteractive preview", () => {
    const html = renderToStaticMarkup(<EventDraftPreview draft={{ ...draft, title: "<script>Party</script>", startsAtUtc: "2026-11-07T22:00:00.000Z" }} artwork={artwork} view="invitation" />);
    expect(html).toContain(draftImageUrl(id, path)); expect(html).not.toContain(headerPath);
    expect(html).toContain("5:00 PM EST"); expect(html).not.toContain("10:00 PM");
    expect(html).toContain("Private preview"); expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script|<form|<button|Spotify|172 Belmont|oyster-roast/);
  });
  it("uses separate header artwork and crop, falling back to invitation artwork when cleared", () => {
    const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={{ ...artwork, header: { ...artwork.header, focalX: 20, focalY: 80, zoomPercent: 130 } }} view="hub" />);
    expect(html).toContain(draftImageUrl(id, headerPath)); expect(html).toContain("object-position:20% 80%"); expect(html).toContain("scale(1.3)");
    const fallback = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={{ ...artwork, header: EMPTY_DRAFT_ARTWORK.header }} view="hub" />);
    expect(fallback).toContain(draftImageUrl(id, path));
  });
  it("uses honest empty states without borrowed live-event information", () => {
    const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={EMPTY_DRAFT_ARTWORK} view="invitation" />);
    expect(html).toContain("Your artwork will appear here"); expect(html).toContain("Date &amp; time to come"); expect(html).toContain("Location to come");
  });
});
