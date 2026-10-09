import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../app/admin/events/[id]/artwork/actions", () => ({ saveDraftArtwork: vi.fn() }));
vi.mock("../app/admin/events/[id]/settings/actions", () => ({ saveDraftSettings: vi.fn() }));
import { EventDraftArtworkEditor } from "../components/admin/event-draft-artwork-editor";
import { EventDraftSettingsEditor } from "../components/admin/event-draft-settings-editor";
import { EditorViewToggle } from "../components/admin/editor-view-toggle";
import { DraftEditorActionBar } from "../components/admin/draft-editor-action-bar";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { draft } from "./fixtures/publication";

describe("consistent private editor layout", () => {
  it.each(["artwork", "settings"])("keeps %s controls mounted with an accessible mobile switch and external submit button", (kind) => {
    const html = renderToStaticMarkup(kind === "artwork"
      ? <EventDraftArtworkEditor draft={draft} initial={{ settings: EMPTY_DRAFT_ARTWORK, revision: 0 }} uploadConfigured={false} />
      : <EventDraftSettingsEditor draft={draft} artwork={EMPTY_DRAFT_ARTWORK} initial={{ settings: DEFAULT_DRAFT_SETTINGS, revision: 0 }} />);
    expect(html).toContain(`id="event-${kind}-form"`); expect(html).toContain(`form="event-${kind}-form"`);
    expect(html).toContain("noValidate"); expect(html).toContain(`aria-controls="${kind}-edit-panel"`);
    expect(html).toContain(`aria-controls="${kind}-preview-panel"`); expect(html).toContain("hidden lg:block");
    expect(html).toContain("fixed inset-x-0 bottom-0"); expect(html).toContain("safe-area-inset-bottom");
    expect(html).toContain("lg:sticky lg:top-6"); expect(html).toContain("lg:overflow-y-auto");
    expect((html.match(/>Review &amp; publish</g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/action="|href="\/e\//);
  });
  it("allows reviewing optional, untouched artwork without a meaningless save", () => {
    const html = renderToStaticMarkup(<EventDraftArtworkEditor draft={draft} initial={{ settings: EMPTY_DRAFT_ARTWORK, revision: 0 }} uploadConfigured={false} />);
    expect(html).toContain(`href="/admin/events/${draft.id}/publish"`); expect(html).toContain("Artwork is optional");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });
  it("requires confirmation of suggested RSVP defaults but permits clean saved settings to review", () => {
    for (const revision of [0, 2]) {
      const html = renderToStaticMarkup(<EventDraftSettingsEditor draft={draft} artwork={EMPTY_DRAFT_ARTWORK} initial={{ settings: DEFAULT_DRAFT_SETTINGS, revision }} />);
      expect(html.split('aria-label="Save and review draft"')[1].includes(`href="/admin/events/${draft.id}/publish"`)).toBe(revision > 0);
      expect(/type="submit"[^>]*disabled=""/.test(html)).toBe(revision > 0);
    }
  });
  it("keeps preview navigation distinct from editing and marks the selected mobile panel", () => {
    const html = renderToStaticMarkup(<EditorViewToggle view="preview" onChange={() => {}} editPanelId="a" previewPanelId="b" />);
    expect(html).toContain('aria-label="Editor view"'); expect(html).toMatch(/aria-pressed="true" aria-controls="b"/);
    expect(html).toMatch(/aria-pressed="false" aria-controls="a"/); expect(html).toContain("min-h-11");
  });
});

const actions = { formId: "form", saveLabel: "Save artwork", saveAllowed: true, reviewReady: true, reviewHref: "/admin/events/example/publish", pending: false, dirty: false, conflict: false, status: "Saved privately.", error: null, reopenHref: "/admin/events/example/artwork", reopenLabel: "Reopen saved artwork", onLeave: () => {} };
describe("shared draft action safeguards", () => {
  it.each([{ dirty: true }, { pending: true }, { conflict: true }, { reviewReady: false }])("prevents review in state %j", (patch) => {
    const html = renderToStaticMarkup(<DraftEditorActionBar {...actions} {...patch} />);
    expect(html).not.toContain(`href="${actions.reviewHref}"`); expect(html).toMatch(/disabled=""[^>]*>Review &amp; publish/);
  });
  it("shows upload progress without a save or review action", () => {
    const html = renderToStaticMarkup(<DraftEditorActionBar {...actions} pending pendingLabel="Uploading…" status="Uploading invitation…" />);
    expect(html).toMatch(/type="submit"[^>]*disabled=""/); expect(html).toContain("Uploading invitation…");
    expect(html).not.toContain(`href="${actions.reviewHref}"`);
  });
  it("keeps failure recovery accessible outside the disabled form", () => {
    const html = renderToStaticMarkup(<DraftEditorActionBar {...actions} conflict error="Please reopen your saved artwork." status="Reopen before saving." />);
    expect(html).toContain('role="alert"'); expect(html).toContain(`href="${actions.reopenHref}"`);
    expect(html).toContain("Reopen saved artwork"); expect(html).not.toContain("<fieldset");
  });
});
