import { describe, expect, it } from "vitest";
import { EMPTY_EVENT_DRAFT, validateEventDraft, validateDraftForm, isDraftId, isDraftRevision } from "../lib/event-drafts";
import { eventLocalInput, eventLocalToUtc, normalizeTimeZone } from "../lib/event-date-time";

const base = { ...EMPTY_EVENT_DRAFT, title: "  A birthday dinner  " };
const form = { ...base, startsAtLocal: "", endsAtLocal: "" };
describe("private draft validation", () => {
  it("requires only a trimmed event name, allowing an incomplete plan", () => {
    expect(validateEventDraft(base)).toEqual({ ok: true, fields: { ...base, title: "A birthday dinner" } });
    expect(validateDraftForm(form)).toEqual(validateEventDraft(base));
  });
  it.each([null, [], {}, { ...base, title: "   " }, { ...base, title: "x".repeat(181) }, { ...base, description: "x".repeat(2001) }, { ...base, hostName: 12 }, { ...base, venue: "bad\u0000value" }, { ...base, address: "x".repeat(301) }, { ...base, timeZone: "not/a/zone" }, { ...base, startsAtUtc: "2026-02-30T17:00:00.000Z" }, { ...base, startsAtUtc: "2026-01-01" }, { ...base, startsAtUtc: undefined }, { ...base, endsAtUtc: "2026-11-07T23:00:00.000Z" }])("rejects malformed or unsafe draft fields: %j", (input) => {
    expect(validateEventDraft(input).ok).toBe(false);
  });
  it("allows a start without an end, but enforces ordered bounded dates", () => {
    const dated = { ...base, startsAtUtc: "2026-11-07T22:00:00.000Z" };
    expect(validateEventDraft(dated).ok).toBe(true);
    expect(validateEventDraft({ ...dated, endsAtUtc: "2026-11-07T23:00:00.000Z" }).ok).toBe(true);
    for (const endsAtUtc of ["2026-11-07T22:00:00.000Z", "2026-11-06T22:00:00.000Z", "2026-11-15T22:00:00.000Z"]) expect(validateEventDraft({ ...dated, endsAtUtc }).ok).toBe(false);
  });
  it("does not permit injected status, event identity or private data to enter storage fields", () => {
    const result = validateDraftForm({ ...form, status: "published", eventSlug: "oyster-roast-2026", publishedAt: "now", secret: "private", startsAtUtc: "2027-01-01T00:00:00.000Z" });
    expect(result).toEqual(validateEventDraft(base));
  });
  it.each([null, {}, { ...form, startsAtLocal: null }, { ...form, endsAtLocal: "2026-01-01T18:00" }, { ...form, startsAtLocal: "2026-03-08T02:30" }, { ...form, startsAtLocal: "2026-11-01T01:30" }, { ...form, timeZone: "bad" }])("validates optional form dates and timezone: %j", (input) => {
    expect(validateDraftForm(input).ok).toBe(false);
  });
  it("checks record IDs and optimistic revisions without using IDs as authorization", () => {
    expect(isDraftId("5199b7de-d731-4bb1-8e55-3380e2f0e365")).toBe(true);
    for (const value of ["1", "oyster-roast-2026", "../events", null]) expect(isDraftId(value)).toBe(false);
    for (const value of [0, 1, 50]) expect(isDraftRevision(value)).toBe(true);
    for (const value of [-1, 0.5, "1", NaN, Infinity, 2147483647]) expect(isDraftRevision(value)).toBe(false);
  });
});

describe("event-local date handling", () => {
  it.each([
    ["2026-11-07T17:00", "America/New_York", "2026-11-07T22:00:00.000Z"],
    ["2026-07-07T17:00", "America/New_York", "2026-07-07T21:00:00.000Z"],
    ["2026-11-07T17:00", "America/Los_Angeles", "2026-11-08T01:00:00.000Z"],
    ["2026-11-07T17:00", "Asia/Kathmandu", "2026-11-07T11:15:00.000Z"],
    ["2026-11-07T17:00", "Pacific/Auckland", "2026-11-07T04:00:00.000Z"],
    ["2026-11-07T00:00", "UTC", "2026-11-07T00:00:00.000Z"],
  ])("round-trips %s in %s independently of the machine timezone", (local, zone, utc) => {
    expect(eventLocalToUtc(local, zone)).toBe(utc);
    expect(eventLocalInput(utc, zone)).toBe(local);
  });
  it.each([
    ["2026-03-08T02:30", "America/New_York"],
    ["2026-11-01T01:30", "America/New_York"],
    ["2026-04-05T01:45", "Australia/Lord_Howe"],
    ["2026-10-04T02:15", "Australia/Lord_Howe"],
    ["2026-02-30T17:00", "UTC"], ["2026-13-01T17:00", "UTC"], ["2026-01-01T25:00", "UTC"],
  ])("rejects invalid, skipped and repeated local times: %s %s", (local, zone) => {
    expect(eventLocalToUtc(local, zone)).toBeNull();
  });
  it("validates timezones and leaves undecided dates blank", () => {
    expect(normalizeTimeZone("America/New_York")).toBe("America/New_York");
    expect(normalizeTimeZone("UTC")).toBe("UTC");
    for (const zone of ["+04:00", "Invalid", "x".repeat(101), null]) expect(normalizeTimeZone(zone)).toBeNull();
    expect(eventLocalInput(null, "UTC")).toBe("");
  });
});
