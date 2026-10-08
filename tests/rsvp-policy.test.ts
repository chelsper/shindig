import { describe, expect, it } from "vitest";
import { DEFAULT_DRAFT_SETTINGS, validateDraftSettings } from "../lib/event-draft-settings";
import { publicationIssues } from "../lib/event-readiness";
import { rsvpAvailability, rsvpDeadlineLabel, validRsvpDeadline } from "../lib/rsvp-policy";
import { eventLocalToUtc } from "../lib/event-date-time";
import { snapshot } from "./fixtures/publication";

describe("optional RSVP limits", () => {
  it("keeps old snapshots unlimited and normalizes defaults to null", () => {
    expect(validateDraftSettings(snapshot.settings)).toMatchObject({ ok: true, settings: { rsvp: { deadlineAtUtc: null, capacity: null } } });
    expect(rsvpAvailability(true, {})).toBe("open");
    expect(DEFAULT_DRAFT_SETTINGS.rsvp).toMatchObject({ deadlineAtUtc: null, capacity: null });
  });
  it.each([0, -1, 1.2, 10001, "32", true, NaN, Infinity])("rejects invalid capacity %s", (capacity) => {
    expect(validateDraftSettings({ ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, capacity } }).ok).toBe(false);
  });
  it.each([1, 32, 10000, null])("accepts capacity %s", (capacity) => {
    expect(validateDraftSettings({ ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, capacity } }).ok).toBe(true);
  });
  it.each(["2026-02-30T22:00:00.000Z", "2026-11-01T25:00:00.000Z", "2026-11-01", "2026-11-01T22:00:01.000Z", "2026-11-01T22:00:00-05:00", 123, "", "1999-11-01T22:00:00.000Z"])("rejects invalid deadline %s", (deadlineAtUtc) => {
    expect(validRsvpDeadline(deadlineAtUtc)).toBe(false);
    expect(validateDraftSettings({ ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, deadlineAtUtc } }).ok).toBe(false);
  });
  it("closes at the exact deadline, with manual closure taking precedence", () => {
    const deadlineAtUtc = "2026-11-01T22:00:00.000Z", now = Date.parse(deadlineAtUtc);
    expect(rsvpAvailability(true, { deadlineAtUtc, capacity: 5 }, 0, now - 1)).toBe("open");
    expect(rsvpAvailability(true, { deadlineAtUtc, capacity: 5 }, 5, now)).toBe("deadline");
    expect(rsvpAvailability(false, { deadlineAtUtc }, 0, now)).toBe("closed");
    expect(rsvpAvailability(true, { capacity: 5 }, 5, now)).toBe("full");
    expect(rsvpAvailability(true, { capacity: 5 }, 4, now)).toBe("open");
  });
  it("uses event-local time, including DST, not the guest's timezone", () => {
    const utc = eventLocalToUtc("2026-11-07T17:00", "America/New_York")!;
    expect(utc).toBe("2026-11-07T22:00:00.000Z");
    expect(rsvpDeadlineLabel(utc, "America/New_York")).toContain("5:00 PM EST");
    expect(eventLocalToUtc("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(eventLocalToUtc("2026-11-01T01:30", "America/New_York")).toBeNull();
  });
  it("rejects publication after the start, without invalidating past published deadlines", () => {
    const issues = (deadlineAtUtc: string) => publicationIssues({ ...snapshot, settings: { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, deadlineAtUtc } } });
    expect(issues("2026-11-09T22:00:00.000Z").map((i) => i.id)).toContain("deadline");
    expect(issues("2001-11-01T22:00:00.000Z").map((i) => i.id)).not.toContain("deadline");
    expect(issues(snapshot.details.startsAtUtc!).map((i) => i.id)).not.toContain("deadline");
  });
});
