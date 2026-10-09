import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../app/actions", () => ({ submitRsvp: vi.fn() }));
vi.mock("../app/e/actions", () => ({ submitEventRsvp: vi.fn() }));
vi.mock("../app/rsvp/actions", () => ({ updateRsvp: vi.fn() }));
vi.mock("../app/admin/events/[id]/artwork/actions", () => ({ saveDraftArtwork: vi.fn() }));
import { parseEventAppearance } from "../lib/event-appearance";
import { EMPTY_DRAFT_ARTWORK, validateDraftArtwork, type DraftArtwork } from "../lib/event-draft-artwork";
import { EVENT_DESIGNS } from "../lib/event-design";
import { parsePublicationSnapshot, publicationEvent } from "../lib/event-publication";
import { EventDraftPreview } from "../components/admin/event-draft-preview";
import { EventDraftArtworkEditor } from "../components/admin/event-draft-artwork-editor";
import { DraftDesignControls } from "../components/admin/draft-design-controls";
import { InvitationPage } from "../components/invitation-page";
import { DesignedHub } from "../components/event-design/event-presentation";
import { RsvpUpdateForm } from "../components/rsvp/rsvp-update-form";
import { draft, snapshot, eventId, otherEventId } from "./fixtures/publication";
const design = { style: "after-dark" as const, invitationCrop: { x: 12, y: 82, zoom: 250 } };
const artwork: DraftArtwork = { ...EMPTY_DRAFT_ARTWORK, design,
  invitation: { path: `event-drafts/${eventId}/invitation/${otherEventId}.png`, alt: "A garden illustration" },
  header: { path: null, alt: "", focalX: 70, focalY: 20, zoomPercent: 240 },
};
describe("saved event appearance", () => {
  it.each(EVENT_DESIGNS)("accepts only canonical $id tokens and bounded independent crops", ({ id }) => {
    const parsed = validateDraftArtwork(eventId, { ...artwork, design: { ...design, style: id } });
    expect(parsed).toEqual({ ok: true, settings: { ...artwork, design: { ...design, style: id } } });
    expect(JSON.stringify(parsed).length).toBeLessThan(4096);
  });
  it.each([null, [], {}, { ...design, style: "url(evil)" }, { ...design, css: "color:red" }, { ...design, invitationCrop: null },
    ...[{ x: -1 }, { x: 101 }, { y: 50.1 }, { y: "30" }, { zoom: 99 }, { zoom: 251 }, { zoom: Infinity }, { style: "secret" }].map((patch) => ({ ...design, invitationCrop: { ...design.invitationCrop, ...patch } }))])("rejects malformed stored or submitted appearance %j", (value) => {
    expect(parseEventAppearance(value)).toBeNull();
    expect(validateDraftArtwork(eventId, { ...artwork, design: value }).ok).toBe(false);
    expect(() => parsePublicationSnapshot(eventId, { ...snapshot, artwork: { ...artwork, design: value } })).toThrow();
  });
  it("does not retrofit old records or relax the old header limits", () => {
    expect(validateDraftArtwork(eventId, EMPTY_DRAFT_ARTWORK)).toEqual({ ok: true, settings: EMPTY_DRAFT_ARTWORK });
    expect(publicationEvent(eventId, snapshot)).not.toHaveProperty("design");
    expect(validateDraftArtwork(eventId, { ...EMPTY_DRAFT_ARTWORK, header: artwork.header }).ok).toBe(false);
  });
  it("projects reviewed style/crops without private image paths or draft metadata", () => {
    const parsed = parsePublicationSnapshot(eventId, { ...snapshot, artwork });
    const event = publicationEvent(eventId, parsed);
    expect(event.design).toEqual(design); expect(event.eventHub.headerImage).toMatchObject({ focalX: 70, focalY: 20, zoomPercent: 240 });
    expect(JSON.stringify(event)).not.toMatch(/event-drafts\/|\/admin\/|revision|owner_host|DATABASE/);
    expect(event.invitation.imageUrl).toContain("/artwork/invitation"); expect(event.eventHub.headerImage.url).toContain("/artwork/header");
  });
  it.each(EVENT_DESIGNS)("shares $id presentation/crops between private preview and real invitation", ({ id }) => {
    const art = { ...artwork, design: { ...design, style: id } };
    const privateHtml = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={art} view="invitation" />);
    const publicHtml = renderToStaticMarkup(<InvitationPage event={publicationEvent(eventId, { ...snapshot, artwork: art })} persistenceDisabled={false} />);
    for (const html of [privateHtml, publicHtml]) {
      expect(html).toContain(`data-event-design="${id}"`); expect(html).toContain("object-position:12% 82%"); expect(html).toContain("scale(2.5)"); expect(html).toContain(draft.title);
    }
    expect(privateHtml).toContain("Private preview"); expect(privateHtml).not.toContain("<form");
    expect(publicHtml).toContain("Submit RSVP"); expect(publicHtml).not.toContain("/admin/"); expect(publicHtml).not.toContain("event-drafts/");
  });
  it("uses the independent Hub crop and invitation image fallback", () => {
    const html = renderToStaticMarkup(<EventDraftPreview draft={draft} artwork={artwork} view="hub" />);
    expect(html).toContain("object-position:70% 20%"); expect(html).toContain("scale(2.4)"); expect(html).not.toContain("scale(2.5)");
  });
  it("retains legacy Jasper presentation and RSVP functionality", () => {
    const html = renderToStaticMarkup(<InvitationPage persistenceDisabled />);
    expect(html).not.toContain("data-event-design"); expect(html).toContain("oyster-roast-invitation.png");
    expect(html).toContain("Another Annualish Oyster Roast"); expect(html).toContain("Attending"); expect(html).toContain("Can’t Make It");
  });
  it("retains closed RSVP rules and navigation inside the selected design", () => {
    const event = publicationEvent(eventId, { ...snapshot, artwork }, false);
    const html = renderToStaticMarkup(<InvitationPage event={event} persistenceDisabled={false} />);
    expect(html).toContain("RSVPs are closed"); expect(html).not.toContain("<form"); expect(html).toContain(event.eventHub.path);
  });
  it("uses the saved palette on private RSVP updates without changing guest controls", () => {
    const event = publicationEvent(eventId, { ...snapshot, artwork });
    const html = renderToStaticMarkup(<RsvpUpdateForm event={event} token={"a".repeat(43)} initialRsvp={{ guestName: "Test Guest", attending: true, partySize: 2, comment: null, displayOnGuestList: false }} />);
    expect(html).toContain('data-event-design="after-dark"'); expect(html).toContain("Save Changes"); expect(html).toContain("This private link only opens your RSVP");
    expect(html).toContain(event.eventHub.path); expect(html).not.toContain("event-drafts/");
  });
  it("renders host controls with accessible independent crops and no automatic publish", () => {
    const html = renderToStaticMarkup(<DraftDesignControls settings={artwork} disabled={false} onChange={() => {}} />);
    expect(html).toContain('name="event-style"'); expect(html).toContain("Original layout"); expect(html).not.toContain('type="submit"');
    const editor = renderToStaticMarkup(<EventDraftArtworkEditor draft={draft} initial={{ settings: artwork, revision: 2 }} uploadConfigured />);
    expect(editor).toContain("Reset invitation crop"); expect(editor).toContain("Reset header crop");
    expect(editor).toContain('aria-label="Invitation zoom"'); expect(editor).toContain('aria-label="Header zoom"'); expect(editor).toContain('max="250"');
    expect(editor).toContain("Save draft design &amp; artwork"); expect(editor).toContain("Preview saved draft"); expect(editor).toContain("Review &amp; publish"); expect(editor).toContain("Private draft");
  });
  it("escapes host text and handles text-only designs without broken image requests", () => {
    const html = renderToStaticMarkup(<DesignedHub appearance={design} details={{ title: "<script>bad</script>", eyebrow: "Host", date: "Date", time: "5 PM", venue: "Garden", address: "Example", description: "" }} image={{ url: "", alt: "", crop: design.invitationCrop }} />);
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<img"); expect(html).not.toContain("<script");
  });
});
