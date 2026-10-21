import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eventSaveStatus, hubSaveNotice, type SaveStatusInput } from "../lib/event-save-status";
import { EventSaveStatus, HubSaveNotice } from "../components/admin/event-save-status";
import { DraftEditorActionBar } from "../components/admin/draft-editor-action-bar";
const live = { visibility: "published" as const, hasUnpublishedChanges: false };
describe("truthful saved / live status", () => {
  it.each([
    [{ publication: live }, "Live — guests see this version"],
    [{ publication: { ...live, hasUnpublishedChanges: true } }, "Saved privately — changes not published"],
    [{ publication: { visibility: null, hasUnpublishedChanges: true } }, "Saved privately — changes not published"],
    [{ publication: live, savedSinceLoad: true }, "Saved privately — changes not published"],
    [{ publication: live, dirty: true }, "Unsaved changes"],
    [{ newDraft: true }, "Private draft"],
    [{ publication: null }, "Saved draft — live status unavailable"],
    [{ publication: { ...live, visibility: "archived" }, savedSinceLoad: true }, "Archived — not live"],
    [{ publication: { ...live, visibility: "unpublished" }, savedSinceLoad: true }, "Unpublished — not live"],
    [{ publication: live, pending: true, dirty: true }, "Working…"],
    [{ publication: live, conflict: true, dirty: true }, "Reopen the latest draft"],
    [{ publication: live, failed: true }, "Changes need attention"],
  ] satisfies [SaveStatusInput, string][])("renders correct state: %j", (props, label) => {
    expect(eventSaveStatus(props).label).toBe(label);
    const html = renderToStaticMarkup(<EventSaveStatus {...props} />);
    expect(html).toContain(label); expect(html).toContain('aria-live="polite"');
    if (label !== "Live — guests see this version") expect(html).not.toContain("Live — guests see this version");
  });
  it("keeps the existing guest version distinct from saved private edits", () => {
    expect(eventSaveStatus({ publication: { ...live, hasUnpublishedChanges: true } }).detail).toContain("last published version");
    expect(eventSaveStatus({ failed: true, savedSinceLoad: true }).label).toBe("Changes need attention");
  });
  it("does not call private or moderated content an immediate public save", () => {
    expect(hubSaveNotice(true)).toContain("immediately");
    expect(hubSaveNotice(false)).toContain("Saves privately");
    expect(hubSaveNotice(true, "private")).toContain("Saves privately");
    expect(hubSaveNotice(true, "moderated")).toContain("Only approved answers are public");
    expect(hubSaveNotice(false, "moderated")).not.toContain("immediately");
    expect(renderToStaticMarkup(<HubSaveNotice live behavior="private" />)).not.toContain("Updates the live Hub");
  });
  const bar = { formId: "details", saveLabel: "Save draft", saveAllowed: true, reviewReady: true, reviewHref: "/admin/events/example/publish", previewHref: "/admin/events/example/preview", pending: false, dirty: false, conflict: false, status: "Save before publishing.", error: null, reopenHref: "/admin/events/example", reopenLabel: "Reopen", onLeave() {}, publicationStatus: { publication: live } };
  it("offers preview and review as navigation only, never as publication writes", () => {
    const html = renderToStaticMarkup(<DraftEditorActionBar {...bar} />);
    expect(html).toContain(`href="${bar.previewHref}"`); expect(html).toContain(`href="${bar.reviewHref}"`);
    expect(html).toContain("Preview changes"); expect(html).not.toContain("<form"); expect(html).not.toContain("Update live event");
  });
  it.each([{ dirty: true }, { pending: true }, { conflict: true }, { reviewReady: false }])("blocks saved preview and review while unsafe: %j", patch => {
    const html = renderToStaticMarkup(<DraftEditorActionBar {...bar} {...patch} />);
    expect(html).not.toContain(`href="${bar.previewHref}"`); expect(html).not.toContain(`href="${bar.reviewHref}"`);
  });
});
