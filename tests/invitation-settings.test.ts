import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INVITATION_SETTINGS as defaults, fromEventLocalInput, toEventLocalInput, validateInvitationSettings, resolveEventConfiguration, isAllowedInvitationImage } from "../lib/invitation-settings";
import { createOysterRoastIcs, getGoogleCalendarUrl, getOutlookCalendarUrl } from "../lib/calendar";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

const mocks = vi.hoisted(() => ({ sql: vi.fn(), neon: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { getInvitationSettings, saveInvitationSettings, getEventConfiguration } from "../lib/server/invitation-settings";

describe("invitation settings validation and canonical event", () => {
  it("preserves the current invitation, routes, artwork and event identity by default", () => {
    expect(validateInvitationSettings(defaults)).toEqual({ success: true, data: defaults });
    expect(resolveEventConfiguration(defaults)).toEqual(OYSTER_ROAST_EVENT);
  });
  it("trims text and drops extra client-controlled identity/flags", () => {
    const result = validateInvitationSettings({ ...defaults, title: "  A new title  ", slug: "evil", features: { guestList: false } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const event = resolveEventConfiguration(result.data);
    expect(event.title).toBe("A new title"); expect(event.slug).toBe("oyster-roast-2026"); expect(event.features.guestList).toBe(true);
  });
  it.each([
    { title: " " }, { description: "x".repeat(2001) }, { venue: "x".repeat(121) },
    { address: "x".repeat(301) }, { cityLabel: "" }, { title: "bad\u0000text" },
    { startsAtUtc: "2026-02-30T22:00:00.000Z" }, { startsAtUtc: "invalid" },
    { endsAtUtc: defaults.startsAtUtc }, { endsAtUtc: "2027-01-01T00:00:00.000Z" },
    { coordinates: { latitude: 91, longitude: 0 } }, { coordinates: { latitude: 1, longitude: NaN } },
    { coordinates: { latitude: "1", longitude: 1 } },
    { invitation: { ...defaults.invitation, imageWidth: 0 } },
    { invitation: { ...defaults.invitation, imageHeight: 12001 } },
    { invitation: { ...defaults.invitation, rsvpHeading: "" } },
    { invitation: { ...defaults.invitation, imageAlt: "" } },
  ])("rejects invalid or oversized input %j", (patch) => {
    expect(validateInvitationSettings({ ...defaults, ...patch }).success).toBe(false);
  });
  it.each([
    "https://evil.test/photo.png", "javascript:alert(1)", "http://abc.public.blob.vercel-storage.com/invitation/oyster-roast-2026/a.png",
    "https://abc.public.blob.vercel-storage.com/event-hub/oyster-roast-2026/a.png",
    "https://abc.public.blob.vercel-storage.com/invitation/other/a.png",
    "https://abc.public.blob.vercel-storage.com/invitation/oyster-roast-2026/a.svg",
    "https://abc.public.blob.vercel-storage.com/invitation/oyster-roast-2026/a.png?secret=x",
    "https://user:pass@abc.public.blob.vercel-storage.com/invitation/oyster-roast-2026/a.png",
  ])("rejects unapproved artwork URLs %s", (url) => expect(isAllowedInvitationImage(url)).toBe(false));
  it("accepts uploaded invitation artwork without changing Hub artwork", () => {
    const imageUrl = "https://abc.public.blob.vercel-storage.com/invitation/oyster-roast-2026/artwork-123.webp";
    expect(isAllowedInvitationImage(imageUrl)).toBe(true);
    expect(resolveEventConfiguration({ ...defaults, invitation: { ...defaults.invitation, imageUrl } }).eventHub.headerImage.url).toBe("/oyster-roast-invitation.png");
  });
  it.each([
    ["2026-11-07T17:00", "2026-11-07T22:00:00.000Z"],
    ["2026-07-07T17:00", "2026-07-07T21:00:00.000Z"],
    ["2026-11-07T00:00", "2026-11-07T05:00:00.000Z"],
  ])("interprets %s in New York regardless of server timezone", (local, utc) => {
    expect(fromEventLocalInput(local)).toBe(utc); expect(toEventLocalInput(utc)).toBe(local);
  });
  it.each(["2026-03-08T02:30", "2026-11-01T01:30", "2026-02-30T12:00", "", "2026-99-99T10:00", "2026-01-01T25:00"]) (
    "rejects ambiguous, nonexistent or malformed local times %s", (local) => expect(fromEventLocalInput(local)).toBeNull(),
  );
  it("uses the same changed details in UI labels and every calendar provider", () => {
    const event = resolveEventConfiguration({ ...defaults, title: "Updated Oyster Roast", address: "Updated address", startsAtUtc: "2026-12-12T23:00:00.000Z", endsAtUtc: "2026-12-13T03:00:00.000Z" });
    expect(event.dateLabel).toBe("Saturday, December 12, 2026"); expect(event.timeLabel).toBe("6:00 PM");
    expect(new URL(getGoogleCalendarUrl(undefined, event)).searchParams.get("dates")).toBe("20261212T230000Z/20261213T030000Z");
    expect(new URL(getOutlookCalendarUrl(undefined, event)).searchParams.get("subject")).toBe(event.title);
    const ics = createOysterRoastIcs(new Date(), undefined, event);
    expect(ics).toContain("SUMMARY:Updated Oyster Roast"); expect(ics).toContain("LOCATION:Updated address");
    expect(event.calendarUid).toBe(OYSTER_ROAST_EVENT.calendarUid);
  });
});

describe("invitation settings persistence", () => {
  beforeEach(() => { vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb"); vi.resetAllMocks(); mocks.neon.mockReturnValue(mocks.sql); });
  afterEach(() => vi.unstubAllEnvs());
  it("uses current canonical defaults only when no settings row exists", async () => {
    mocks.sql.mockResolvedValue([]);
    expect(await getInvitationSettings()).toEqual({ settings: defaults, revision: 0 });
    expect(mocks.sql.mock.calls[0][1]).toBe("oyster-roast-2026");
  });
  it("returns validated persisted settings", async () => {
    mocks.sql.mockResolvedValue([{ settings: { ...defaults, title: "Published" }, revision: 2 }]);
    expect((await getEventConfiguration()).title).toBe("Published");
  });
  it("does not silently replace corrupt or unavailable settings with old dates", async () => {
    mocks.sql.mockResolvedValue([{ settings: { title: "bad" }, revision: 1 }]);
    await expect(getInvitationSettings()).rejects.toThrow();
    mocks.sql.mockRejectedValue(new Error("DB unavailable"));
    await expect(getEventConfiguration()).rejects.toThrow();
  });
  it("supports a database-free local preview, but never a database-free save", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await getEventConfiguration()).toEqual(OYSTER_ROAST_EVENT);
    await expect(saveInvitationSettings(defaults, 0)).rejects.toThrow();
  });
  it("first-save uses conflict-do-nothing and subsequent saves compare revisions", async () => {
    mocks.sql.mockResolvedValueOnce([{ revision: 1 }]).mockResolvedValueOnce([{ revision: 2 }]).mockResolvedValueOnce([]);
    expect(await saveInvitationSettings(defaults, 0)).toBe(1);
    expect(mocks.sql.mock.calls[0][0].join("?")).toContain("ON CONFLICT (event_slug) DO NOTHING");
    expect(await saveInvitationSettings(defaults, 1)).toBe(2);
    const [query, ...values] = mocks.sql.mock.calls[1];
    expect(query.join("?")).toContain("AND revision = ?");
    expect(values).toEqual([JSON.stringify(defaults), "oyster-roast-2026", 1]);
    expect(await saveInvitationSettings(defaults, 1)).toBeNull();
  });
  it("rejects invalid data before running a database query", async () => {
    await expect(saveInvitationSettings({ ...defaults, title: "" }, 0)).rejects.toThrow();
    await expect(saveInvitationSettings(defaults, -1)).rejects.toThrow();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
