import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eventEditorPreview, type EventEditorFields } from "../lib/event-editor-preview";
import { EMPTY_EVENT_DRAFT } from "../lib/event-drafts";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { DEFAULT_DRAFT_SETTINGS } from "../lib/event-draft-settings";
import { EventEditorPreview } from "../components/admin/event-editor-preview";
import { EventEditorActions } from "../components/admin/event-editor-actions";

const id = "5199b7de-d731-4bb1-8e55-3380e2f0e365";
const fields: EventEditorFields = { ...EMPTY_EVENT_DRAFT, title: " Garden supper ", startsAtLocal: "2026-11-07T17:00", endsAtLocal: "2026-11-07T22:00" };
const context = { artwork: EMPTY_DRAFT_ARTWORK, settings: { settings: DEFAULT_DRAFT_SETTINGS, revision: 0 } };
const actions = { id, revision: 2, dirty: false, pending: false, conflict: false, hasTitle: true, error: null, saved: false, onLeave: () => {} };

describe("live event editor preview", () => {
  it("projects only invitation fields, trims text and converts local dates without mutating the form", () => {
    const input = { ...fields, location: { secret: "not for preview" }, revision: 42 };
    const before = structuredClone(input);
    const { draft, issue } = eventEditorPreview(id, input);
    expect(issue).toBeNull(); expect(draft.title).toBe("Garden supper");
    expect(draft.startsAtUtc).toBe("2026-11-07T22:00:00.000Z");
    expect(draft.endsAtUtc).toBe("2026-11-08T03:00:00.000Z");
    expect(draft).not.toHaveProperty("location"); expect(draft).not.toHaveProperty("revision");
    expect(input).toEqual(before);
  });
  it("updates typed details and timezone immediately, ignoring old saved UTC values", () => {
    const result = eventEditorPreview(id, { ...fields, title: "Birthday", timeZone: "America/Los_Angeles", startsAtUtc: "2020-01-01T00:00:00.000Z" });
    expect(result.draft.title).toBe("Birthday"); expect(result.draft.startsAtUtc).toBe("2026-11-08T01:00:00.000Z");
  });
  it.each(["2026-03-08T02:30", "2026-11-01T01:30", "2026-02-30T17:00", "not a date"])("withholds impossible or ambiguous time %s", (startsAtLocal) => {
    const result = eventEditorPreview(id, { ...fields, startsAtLocal, endsAtLocal: "" });
    expect(result.draft.startsAtUtc).toBeNull(); expect(result.issue).toBeTruthy();
  });
  it("handles blank/incomplete and malformed timezone values without fabricated event details", () => {
    const blank = eventEditorPreview(id, { ...EMPTY_EVENT_DRAFT, startsAtLocal: "", endsAtLocal: "" });
    expect(blank.draft.title).toBe("Your gathering"); expect(blank.draft.startsAtUtc).toBeNull(); expect(blank.issue).toBeNull();
    const invalid = eventEditorPreview(id, { ...fields, timeZone: "bad/timezone" });
    expect(invalid.draft.startsAtUtc).toBeNull(); expect(invalid.issue).toContain("timezone");
    expect(eventEditorPreview(id, { ...fields, endsAtLocal: "2026-11-07T16:00" }).issue).toContain("end time");
  });
  it("renders current form values, saved private artwork/design and saved RSVP choices without live guest actions", () => {
    const path = `event-drafts/${id}/invitation/30dc54b7-c8d7-4dd1-969e-c1b64a7b8df6.png`;
    const html = renderToStaticMarkup(<EventEditorPreview id={id} fields={{ ...fields, title: "<script>Party</script>" }} dirty context={{
      artwork: { ...EMPTY_DRAFT_ARTWORK, design: { style: "coastal", invitationCrop: { x: 20, y: 60, zoom: 110 } }, invitation: { path, alt: "Private flowers" } },
      settings: { revision: 3, settings: { ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, maxPartySize: 4, allowComments: false }, features: { ...DEFAULT_DRAFT_SETTINGS.features, guestList: false } } },
    }} />);
    for (const text of ["Includes unsaved edits", "Not the live invitation", "&lt;script&gt;Party", "5:00 PM EST", "data-event-design=\"coastal\"", "Up to 4 guests", `/admin/events/${id}/artwork/image?path=`]) expect(html).toContain(text);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit RSVP/);
    expect(html).not.toMatch(/<script|<form|href="\/e\/|Show my name|Comment \(optional\)|172 Belmont|Spotify|suggested defaults|blob.vercel/);
  });
  it("labels defaults and incomplete details honestly", () => {
    const html = renderToStaticMarkup(<EventEditorPreview id={id} fields={{ ...EMPTY_EVENT_DRAFT, startsAtLocal: "", endsAtLocal: "" }} context={context} dirty={false} />);
    for (const text of ["Your gathering", "Date &amp; time to come", "Location to come", "suggested defaults", "Private draft preview"]) expect(html).toContain(text);
  });
  it("does not render guessed artwork/settings when preview data is unavailable", () => {
    const html = renderToStaticMarkup(<EventEditorPreview id={id} fields={fields} context={null} dirty />);
    expect(html).toContain("preview is unavailable"); expect(html).not.toContain("Submit RSVP"); expect(html).not.toContain("suggested defaults");
  });
});

describe("persistent save/review actions", () => {
  it("reviews only a saved, clean draft and never submits a publication action", () => {
    const html = renderToStaticMarkup(<EventEditorActions {...actions} />);
    expect(html).toContain(`href="/admin/events/${id}/publish"`);
    expect(html).toContain('form="event-details-form"'); expect(html).toContain("fixed inset-x-0 bottom-0");
    expect(html).toContain("safe-area-inset-bottom"); expect(html).toContain("Review does not publish");
    expect(html).not.toMatch(/<form|action=/);
  });
  it.each([{ dirty: true }, { revision: 0 }, { pending: true }, { conflict: true }])("blocks review for unsafe state %j", (patch) => {
    const html = renderToStaticMarkup(<EventEditorActions {...actions} {...patch} />);
    expect(html).not.toContain(`href="/admin/events/${id}/publish"`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Review &amp; publish/);
  });
  it("keeps save available for valid dirty edits and reports errors without false success", () => {
    const html = renderToStaticMarkup(<EventEditorActions {...actions} dirty error="Try again shortly." />);
    expect(html).toMatch(/<button type="submit"[^>]*>Save draft/);
    expect(html).not.toMatch(/<button type="submit"[^>]*disabled/);
    expect(html).toContain('role="alert"'); expect(html).toContain("Try again shortly."); expect(html).not.toContain("Draft saved privately.");
  });
  it("keeps conflicts blocked and exposes a protected recovery path", () => {
    const html = renderToStaticMarkup(<EventEditorActions {...actions} dirty conflict error="Reopen this draft." />);
    expect(html).toMatch(/<button type="submit"[^>]*disabled/); expect(html).toContain(`href="/admin/events/${id}"`);
    expect(html).toContain("Reopen saved draft");
  });
});
