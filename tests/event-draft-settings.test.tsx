import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_DRAFT_SETTINGS, DRAFT_HUB_MODULES, draftReadiness, validateDraftSettings } from "../lib/event-draft-settings";
import { EMPTY_EVENT_DRAFT, type EventDraft } from "../lib/event-drafts";
import { EMPTY_DRAFT_ARTWORK } from "../lib/event-draft-artwork";
import { DraftHubPreview, DraftRsvpPreview } from "../components/admin/event-draft-experience-preview";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

const draft: EventDraft = { ...EMPTY_EVENT_DRAFT, id: "5199b7de-d731-4bb1-8e55-3380e2f0e365", title: "Private party", status: "draft", revision: 1, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z" };
describe("draft RSVP and Hub settings", () => {
  it("has one set of conservative defaults without mutating live configuration", () => {
    const before = JSON.stringify(OYSTER_ROAST_EVENT);
    const result = validateDraftSettings(DEFAULT_DRAFT_SETTINGS);
    expect(result).toEqual({ ok: true, settings: DEFAULT_DRAFT_SETTINGS });
    if (!result.ok) throw new Error("defaults failed");
    result.settings.features.guestList = false;
    expect(DEFAULT_DRAFT_SETTINGS.features.guestList).toBe(true);
    expect(JSON.stringify(OYSTER_ROAST_EVENT)).toBe(before);
  });
  it.each([1, 4, 20])("accepts a party limit of %s", (maxPartySize) => {
    expect(validateDraftSettings({ ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, maxPartySize } }).ok).toBe(true);
  });
  it.each([0, 21, -1, 1.5, "4", null, undefined, NaN, Infinity])("rejects invalid party limit %s", (maxPartySize) => {
    expect(validateDraftSettings({ ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, maxPartySize } }).ok).toBe(false);
  });
  it.each([null, [], {}, { ...DEFAULT_DRAFT_SETTINGS, published: true }, { ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, secret: true } }, { ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, allowComments: "false" } }, { ...DEFAULT_DRAFT_SETTINGS, rsvp: { ...DEFAULT_DRAFT_SETTINGS.rsvp, guestListDefaultVisible: 1 } }, { ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, unknown: true } }, { ...DEFAULT_DRAFT_SETTINGS, features: [] }, { ...DEFAULT_DRAFT_SETTINGS, features: { guestList: true } }])("rejects malformed or extra settings: %j", (input) => {
    expect(validateDraftSettings(input).ok).toBe(false);
  });
  it.each(["photos", "potluck"])("cannot enable unimplemented feature %s", (id) => {
    expect(validateDraftSettings({ ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, [id]: true } }).ok).toBe(false);
  });
  it.each(DRAFT_HUB_MODULES)("supports only boolean values for $id", ({ id }) => {
    for (const value of [true, false]) expect(validateDraftSettings({ ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, [id]: value } }).ok).toBe(true);
    for (const value of [null, "true", 1, {}]) expect(validateDraftSettings({ ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, [id]: value } }).ok).toBe(false);
  });
});

describe("private previews and readiness", () => {
  it("previews the maximum, comments and privacy choice without a working form", () => {
    const settings = { ...DEFAULT_DRAFT_SETTINGS, rsvp: { maxPartySize: 3, allowComments: true, guestListDefaultVisible: true } };
    const html = renderToStaticMarkup(<DraftRsvpPreview settings={settings} />);
    for (const text of ["Guest name (required)", "Number attending (required)", "Up to 3 guests", "Comment (optional)", "Show my name", "Preview only", 'checked=""']) expect(html).toContain(text);
    expect(html).not.toContain('value="4"'); expect(html).not.toContain("<form");
    expect(html).toMatch(/disabled="">Submit RSVP/);
  });
  it("hides disabled comment/privacy fields and supports an unchecked opt-in default", () => {
    const settings = structuredClone(DEFAULT_DRAFT_SETTINGS);
    settings.rsvp.allowComments = false; settings.rsvp.guestListDefaultVisible = false;
    let html = renderToStaticMarkup(<DraftRsvpPreview settings={settings} />);
    expect(html).not.toContain("Comment (optional)"); expect(html).not.toContain('checked=""');
    settings.features.guestList = false;
    html = renderToStaticMarkup(<DraftRsvpPreview settings={settings} />);
    expect(html).not.toContain("Show my name");
  });
  it("previews only enabled module tabs with no borrowed live content", () => {
    const settings = structuredClone(DEFAULT_DRAFT_SETTINGS);
    for (const { id } of DRAFT_HUB_MODULES) settings.features[id] = true;
    let html = renderToStaticMarkup(<DraftHubPreview settings={settings} />);
    for (const { id } of DRAFT_HUB_MODULES) expect(html).toContain(`hub-tab-${id}`);
    expect(html).toContain("No weather data is requested"); expect(html).toContain("only when a poll is open");
    expect(html).not.toMatch(/Around the roast|172 Belmont|<form|src=|oyster-roast|hub-tab-photos|hub-tab-potluck/);
    for (const { id } of DRAFT_HUB_MODULES) settings.features[id] = false;
    html = renderToStaticMarkup(<DraftHubPreview settings={settings} />);
    expect(html).not.toContain("hub-tab-"); expect(html).toContain("no optional modules are selected");
  });
  it("tracks unsaved choices and missing basics instead of promising publication", () => {
    const items = draftReadiness(draft, EMPTY_DRAFT_ARTWORK, DEFAULT_DRAFT_SETTINGS, false);
    expect(items.filter((item) => item.required && !item.complete).map((item) => item.id)).toEqual(["date", "location", "settings", "end"]);
    expect(items.find((item) => item.id === "artwork")).toMatchObject({ complete: false, required: false });
    const complete = draftReadiness({ ...draft, startsAtUtc: "2026-11-07T22:00:00.000Z", endsAtUtc: "2026-11-08T02:00:00.000Z", address: "123 Test Lane" }, EMPTY_DRAFT_ARTWORK, DEFAULT_DRAFT_SETTINGS, true);
    expect(complete.filter((item) => item.required && !item.complete)).toHaveLength(0);
  });
  it("does not silently reuse the Oyster Roast coordinates when weather is selected", () => {
    const items = draftReadiness(draft, EMPTY_DRAFT_ARTWORK, { ...DEFAULT_DRAFT_SETTINGS, features: { ...DEFAULT_DRAFT_SETTINGS.features, weather: true } }, true);
    expect(items.find((item) => item.id === "weather")).toMatchObject({ complete: false, required: true, href: `/admin/events/${draft.id}/publish` });
  });
});
