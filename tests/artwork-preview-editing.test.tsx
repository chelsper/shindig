import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EventDraftPreview } from "../components/admin/event-draft-preview";
import { ArtworkPreviewAction } from "../components/admin/artwork-preview-action";
import { DesignedHub, DesignedInvitation } from "../components/event-design/event-presentation";
import { EMPTY_DRAFT_ARTWORK, type DraftArtwork } from "../lib/event-draft-artwork";
import { draft, eventId, otherEventId } from "./fixtures/publication";

const original: DraftArtwork = { invitation: { path: `event-drafts/${eventId}/invitation/${otherEventId}.png`, alt: "Flowers" }, header: { path: null, alt: "", focalX: 30, focalY: 65, zoomPercent: 130 } };
const styled: DraftArtwork = { ...original, design: { style: "coastal", palette: "midnight", invitationCrop: { x: 20, y: 80, zoom: 180 } } };

describe("private preview image selection", () => {
  it.each([original, styled, EMPTY_DRAFT_ARTWORK, { ...EMPTY_DRAFT_ARTWORK, design: styled.design }])("selects the actual image or empty artwork area in every layout", artwork => {
    for (const view of ["invitation", "hub"] as const) {
      const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={artwork} view={view} onEditArtwork={vi.fn()} />);
      const kind = view === "hub" ? "header" : "invitation";
      expect(html).toContain(`aria-controls="artwork-${kind}-controls"`);
      expect(html).toContain(`aria-label="${view === "hub" ? "Edit Event Hub header" : "Edit invitation image"}"`);
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).not.toMatch(/<form|type="submit"/);
    }
  });
  it.each(["header", "invitation"] as const)("sends only the selected %s kind; disabled controls do nothing", kind => {
    const onSelect = vi.fn();
    ArtworkPreviewAction({ kind, onSelect }).props.onClick();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(kind);
    ArtworkPreviewAction({ kind, onSelect, disabled: true }).props.onClick();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(<ArtworkPreviewAction kind={kind} onSelect={onSelect} disabled />)).toMatch(/<button[^>]*disabled=""/);
  });
  it("keeps full guest previews noninteractive when not opened by the artwork editor", () => {
    for (const artwork of [original, styled, EMPTY_DRAFT_ARTWORK]) for (const view of ["hub", "invitation"] as const) {
      const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={artwork} view={view} fullPage />);
      expect(html).not.toMatch(/Edit Event Hub|Edit invitation|artwork-header-controls|<button/);
    }
  });
  it.each([DesignedHub, DesignedInvitation])("cannot render an editor action in public presentation", Component => {
    const props = { appearance: styled.design!, details: { title: "Gathering", eyebrow: "Welcome", date: "Saturday", time: "5 PM", venue: "Garden", address: "Test", description: "Hello" }, image: { url: "/test.png", alt: "Test", crop: styled.design!.invitationCrop }, artworkAction: <button type="button">Private image action</button> };
    expect(renderToStaticMarkup(<Component {...props} />)).not.toContain("Private image action");
    expect(renderToStaticMarkup(<Component {...props} preview />)).toContain("Private image action");
  });
});
