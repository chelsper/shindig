import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DraftArtworkFraming } from "../components/admin/draft-artwork-framing";
import { ArtworkCrop } from "../components/design-studio/artwork-crop";
import { EventDraftPreview } from "../components/admin/event-draft-preview";
import { EMPTY_DRAFT_ARTWORK, draftImageUrl, validateDraftArtwork, type DraftArtwork } from "../lib/event-draft-artwork";
import { defaultArtworkCrop, type ArtworkCrop as Crop } from "../lib/design-artwork";
import { draft, eventId, otherEventId } from "./fixtures/publication";

const settings: DraftArtwork = {
  design: { style: "coastal", invitationCrop: { x: 10, y: 20, zoom: 155 }, palette: "fern", typography: "storybook" },
  invitation: { path: `event-drafts/${eventId}/invitation/${otherEventId}.png`, alt: "Invitation illustration" },
  header: { path: `event-drafts/${eventId}/header/${otherEventId}.jpg`, alt: "Garden photo", focalX: 40, focalY: 80, zoomPercent: 180 },
};
type Element = ReactElement<Record<string, unknown>>;
function find(predicate: (element: Element) => boolean, node: ReactNode): Element | undefined {
  if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child); if (found) return found; } }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return predicate(node) ? node : find(predicate, node.props.children as ReactNode);
}
function setup(patch: Partial<Parameters<typeof DraftArtworkFraming>[0]> = {}) {
  const onChange = vi.fn(), onDeviceChange = vi.fn();
  const props = { id: eventId, settings, kind: "header" as const, device: "phone" as const, disabled: false, onChange, onDeviceChange, ...patch };
  return { props, tree: DraftArtworkFraming(props), onChange, onDeviceChange };
}
describe("independent inline draft artwork framing", () => {
  it("shows header drag and slider controls without needing to select a preview tab", () => {
    const { props } = setup();
    const html = renderToStaticMarkup(<DraftArtworkFraming {...props} />);
    expect(html).toContain("Adjust header image"); expect(html).toContain("Drag to reposition");
    for (const label of ["Header zoom", "Header horizontal position", "Header vertical position"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("Phone header"); expect(html).toContain("Desktop header"); expect(html).toContain("Reset header crop");
    expect(html).toContain(draftImageUrl(eventId, settings.header.path!)); expect(html).not.toContain(settings.invitation.path!);
  });
  it.each(["header", "invitation"] as const)("dragging the %s changes only that crop", kind => {
    const { tree, onChange } = setup({ kind });
    const next = { x: 15, y: 65, zoom: 190 };
    (find(el => el.type === ArtworkCrop, tree)!.props.onChange as (crop: Crop) => void)(next);
    const saved = onChange.mock.lastCall![0] as DraftArtwork;
    expect(validateDraftArtwork(eventId, saved).ok).toBe(true);
    expect(saved.invitation).toEqual(settings.invitation);
    if (kind === "header") {
      expect(saved.design).toEqual(settings.design);
      expect(saved.header).toEqual({ ...settings.header, focalX: 15, focalY: 65, zoomPercent: 190 });
    } else {
      expect(saved.header).toEqual(settings.header);
      expect(saved.design).toEqual({ ...settings.design, invitationCrop: next });
    }
  });
  it.each(["header", "invitation"] as const)("resetting the %s preserves the other image and crop", kind => {
    const { tree, onChange } = setup({ kind });
    const button = find(el => el.type === "button" && Array.isArray(el.props.children) && el.props.children[0] === "Reset ", tree)!;
    (button.props.onClick as () => void)();
    const saved = onChange.mock.lastCall![0] as DraftArtwork;
    if (kind === "header") {
      expect(saved.header).toEqual({ ...settings.header, focalX: 50, focalY: 50, zoomPercent: 100 });
      expect(saved.design).toEqual(settings.design);
    } else {
      expect(saved.design).toEqual({ ...settings.design, invitationCrop: defaultArtworkCrop() });
      expect(saved.header).toEqual(settings.header);
    }
  });
  it("uses invitation artwork as the header fallback without changing invitation framing", () => {
    const fallback = { ...settings, header: { ...settings.header, path: null, alt: "" } };
    const { props, tree, onChange } = setup({ settings: fallback });
    const html = renderToStaticMarkup(<DraftArtworkFraming {...props} />);
    expect(html).toContain("Using your invitation artwork"); expect(html).toContain(draftImageUrl(eventId, settings.invitation.path!));
    const slider = find(el => el.type === "input" && el.props["aria-label"] === "Header zoom", tree)!;
    (slider.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "210" } });
    expect(onChange.mock.lastCall![0]).toEqual({ ...fallback, header: { ...fallback.header, zoomPercent: 210 } });
  });
  it("changes header preview size without modifying saved settings", () => {
    const { tree, onDeviceChange, onChange } = setup();
    (find(el => el.type === "button" && el.props.children === "Desktop header", tree)!.props.onClick as () => void)();
    expect(onDeviceChange).toHaveBeenCalledWith("desktop"); expect(onChange).not.toHaveBeenCalled();
  });
  it.each(["phone", "desktop"] as const)("matches %s header geometry for styled and original layouts", device => {
    const styled = setup({ device });
    expect(find(el => el.type === ArtworkCrop, styled.tree)!.props.aspect).toBe(device === "phone" ? 16 / 9 : 3);
    const original = { invitation: settings.invitation, header: settings.header };
    const plain = setup({ device, settings: original });
    expect(find(el => el.type === ArtworkCrop, plain.tree)!.props.aspect).toBe(device === "phone" ? 16 / 9 : 16 / 6);
    expect(find(el => el.type === "input" && el.props["aria-label"] === "Header zoom", plain.tree)!.props.max).toBe(200);
    const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={original} view="hub" fullPage={device === "desktop"} />);
    expect(html).toContain(device === "phone" ? "aspect-[16/9]" : "sm:aspect-[16/6]");
    expect(setup({ settings: original, kind: "invitation" }).tree).toBeNull();
  });
  it("disables drag, sliders, reset and size actions during a pending save or conflict", () => {
    const { props, tree, onChange, onDeviceChange } = setup({ disabled: true });
    expect(renderToStaticMarkup(<DraftArtworkFraming {...props} />)).toContain('<fieldset disabled=""');
    expect(find(el => el.type === ArtworkCrop, tree)!.props.onChange).toBeUndefined();
    (find(el => el.type === "input", tree)!.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "140" } });
    (find(el => el.type === "button", tree)!.props.onClick as () => void)();
    expect(onChange).not.toHaveBeenCalled(); expect(onDeviceChange).not.toHaveBeenCalled();
  });
  it("offers an honest empty state without controls or broken image requests", () => {
    const { props } = setup({ settings: EMPTY_DRAFT_ARTWORK });
    const html = renderToStaticMarkup(<DraftArtworkFraming {...props} />);
    expect(html).toContain("Upload a header above"); expect(html).not.toMatch(/<img|type="range"/);
  });
});
