import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { appearanceForStyle, parseEventAppearance } from "../lib/event-appearance";
import { changeDraftArtworkCrop, draftArtworkCrop, validateDraftArtwork, type DraftArtwork } from "../lib/event-draft-artwork";
import { parseArtworkCrop } from "../lib/responsive-artwork";
import { parsePublicationSnapshot, publicationEvent } from "../lib/event-publication";
import { compareEventPublication } from "../lib/event-publication-changes";
import { EventDraftPreview } from "../components/admin/event-draft-preview";
import { EventHeaderImage } from "../components/event-hub/event-header-image";
import { DesignedInvitation } from "../components/event-design/event-presentation";
import { draft, eventId, otherEventId, snapshot } from "./fixtures/publication";

const phone = { x: 17, y: 65, zoom: 180 }, desktop = { x: 80, y: 20, zoom: 125 };
const base: DraftArtwork = { design: { style: "coastal", invitationCrop: phone, palette: "fern" },
  invitation: { path: `event-drafts/${eventId}/invitation/${otherEventId}.png`, alt: "Oysters" },
  header: { path: null, alt: "", focalX: 17, focalY: 65, zoomPercent: 180 } };
const responsive: DraftArtwork = { ...base, design: { ...base.design!, invitationDesktopCrop: desktop }, header: { ...base.header, desktopCrop: desktop } };

describe("responsive artwork contract", () => {
  it("round-trips legacy records without adding fields or changing either size", () => {
    expect(validateDraftArtwork(eventId, base)).toEqual({ ok: true, settings: base });
    for (const kind of ["invitation", "header"] as const) for (const device of ["phone", "desktop"] as const) expect(draftArtworkCrop(base, kind, device)).toEqual(phone);
  });
  it.each(["invitation", "header"] as const)("freezes the other size on the first %s edit, regardless of editing order", kind => {
    for (const device of ["phone", "desktop"] as const) {
      const other = device === "phone" ? "desktop" : "phone";
      const changed = changeDraftArtworkCrop(base, kind, device, desktop);
      expect(draftArtworkCrop(changed, kind, device)).toEqual(desktop);
      expect(draftArtworkCrop(changed, kind, other)).toEqual(phone);
      const again = changeDraftArtworkCrop(changed, kind, other, { x: 3, y: 9, zoom: 222 });
      expect(draftArtworkCrop(again, kind, device)).toEqual(desktop);
      expect(draftArtworkCrop(again, kind, other)).toEqual({ x: 3, y: 9, zoom: 222 });
      expect(again.invitation).toEqual(base.invitation);
      expect(kind === "header" ? again.design : again.header).toEqual(kind === "header" ? base.design : base.header);
    }
  });
  it("round-trips all four crops in snapshots without private paths in public configuration", () => {
    expect(validateDraftArtwork(eventId, responsive)).toEqual({ ok: true, settings: responsive });
    const parsed = parsePublicationSnapshot(eventId, JSON.parse(JSON.stringify({ ...snapshot, artwork: responsive })));
    expect(parsed.artwork).toEqual(responsive);
    const event = publicationEvent(eventId, parsed);
    expect(event.design?.invitationCrop).toEqual(phone); expect(event.design?.invitationDesktopCrop).toEqual(desktop);
    expect(event.eventHub.headerImage).toMatchObject({ focalX: 17, focalY: 65, zoomPercent: 180, desktopCrop: desktop });
    expect(JSON.stringify(event)).not.toMatch(/event-drafts\/|\/admin\/|private.blob/);
    expect(JSON.stringify(responsive).length).toBeLessThan(4096);
  });
  it.each([null, {}, [], "20", { ...desktop, x: -1 }, { ...desktop, x: 101 }, { ...desktop, y: 0.5 }, { ...desktop, y: NaN }, { ...desktop, zoom: 99 }, { ...desktop, zoom: 251 }, { ...desktop, zoom: Infinity }, { ...desktop, x: "20" }, { ...desktop, style: "url(evil)" }])("rejects malformed desktop crops at the server boundary: %j", invalid => {
    expect(parseArtworkCrop(invalid)).toBeNull();
    for (const artwork of [{ ...base, header: { ...base.header, desktopCrop: invalid } }, { ...base, design: { ...base.design, invitationDesktopCrop: invalid } }]) {
      expect(validateDraftArtwork(eventId, artwork).ok).toBe(false);
      expect(() => parsePublicationSnapshot(eventId, { ...snapshot, artwork })).toThrow();
    }
  });
  it("preserves both invitation crops during style/color resets and enforces original-layout limits", () => {
    expect(appearanceForStyle("classic", responsive.design)).toEqual({ style: "classic", invitationCrop: phone, invitationDesktopCrop: desktop });
    expect(parseEventAppearance(appearanceForStyle("coastal", responsive.design))?.invitationDesktopCrop).toEqual(desktop);
    const original = { invitation: base.invitation, header: { ...base.header, desktopCrop: { ...desktop, zoom: 201 } } };
    expect(validateDraftArtwork(eventId, original).ok).toBe(false);
    expect(changeDraftArtworkCrop(original, "header", "desktop", { ...desktop, zoom: 250 })).toBe(original);
    expect(changeDraftArtworkCrop(original, "invitation", "phone", desktop)).toBe(original);
  });
  it.each(["header", "invitation"] as const)("reviews a %s desktop-only adjustment without a false phone change", kind => {
    const changed = changeDraftArtworkCrop(base, kind, "desktop", desktop);
    const review = compareEventPublication(eventId, { ...snapshot, artwork: base }, { ...snapshot, artwork: changed });
    expect(review.changeCount).toBe(1);
    expect(review.groups[0].changes[0]).toMatchObject({ id: `${kind}DesktopCrop`, label: `${kind === "header" ? "Hub" : "Invitation"} framing · Desktop` });
    expect(review.calendarChanged).toBe(false);
    const equivalent = changeDraftArtworkCrop(base, kind, "desktop", phone);
    expect(compareEventPublication(eventId, { ...snapshot, artwork: base }, { ...snapshot, artwork: equivalent }).changeCount).toBe(0);
  });
});

describe("preview and public responsive image rendering", () => {
  it.each(["invitation", "hub"] as const)("sends both crops to the %s preview without selecting based on host viewport", view => {
    const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={responsive} view={view} fullPage />);
    expect(html).toContain("--art-phone-position:17% 65%"); expect(html).toContain("--art-desktop-position:80% 20%");
    expect(html).toContain("--art-phone-scale:1.8"); expect(html).toContain("--art-desktop-scale:1.25");
  });
  it("uses the same invitation styling contract in the published presentation", () => {
    const html = renderToStaticMarkup(<DesignedInvitation appearance={responsive.design!} details={{ title: "Supper", eyebrow: "Welcome", date: "Saturday", time: "5 PM", venue: "Garden", address: "Example", description: "Stay awhile" }} image={{ url: "/art.png", alt: "Oysters", crop: phone, desktopCrop: desktop }} />);
    expect(html).toContain("--art-phone-position:17% 65%"); expect(html).toContain("--art-desktop-position:80% 20%");
    expect(html).not.toMatch(/Edit invitation|\/admin\//);
  });
  it("supports responsive original-layout headers and fixed phone/desktop previews", () => {
    const original = { invitation: base.invitation, header: responsive.header };
    for (const device of ["phone", "desktop"] as const) {
      const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={original} view="hub" fullPage device={device} />);
      expect(html).toContain(`data-device="${device}"`); expect(html).toContain("--art-desktop-position:80% 20%");
    }
    const html = renderToStaticMarkup(<EventHeaderImage settings={{ imageUrl: "/oyster-roast-invitation.png", imageAlt: "Oysters", focalX: 17, focalY: 65, zoomPercent: 180, desktopCrop: desktop }} />);
    expect(html).toContain("--art-phone-position:17% 65%"); expect(html).toContain("--art-desktop-position:80% 20%");
  });
});
