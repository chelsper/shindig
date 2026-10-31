import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../app/admin/guests/duplicates/actions", () => ({ refreshDuplicateReview: vi.fn(), reviewDuplicateRsvp: vi.fn() }));
import { similarGuestNames, normalizedGuestName, findDuplicatePairs, duplicatePairKey, parseDuplicateDecision, type DuplicateResponse } from "../lib/rsvp-duplicates";
import { DuplicateRsvpPanel } from "../components/admin/duplicate-rsvp-panel";
import { DuplicateRsvpLink } from "../components/admin/duplicate-rsvp-link";
const older: DuplicateResponse = { id: "00000000-0000-4000-8000-000000000001", guestName: "Virginia Berg", attending: true, partySize: 3, displayOnGuestList: true, comment: "Earlier note", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", version: "a".repeat(32) };
const latest = { ...older, id: "00000000-0000-4000-8000-000000000002", attending: false, partySize: null, comment: "Later note", updatedAt: "2026-10-20T12:00:00Z", version: "b".repeat(32) };
describe("host duplicate suggestions", () => {
  it.each([["Virginia Berg", " virginia   berg "], ["José O’Neil", "Jose ONeil"], ["Virginia Berg", "Virginia Berg."]])("normalizes %s / %s", (a, b) => expect(similarGuestNames(a, b)).toBe("Matching name"));
  it.each([["Virginia Berg", "Virgina Berg"], ["Chelsea Santoro", "Chelsea Santorro"]])("flags conservative spelling hints %s / %s", (a, b) => expect(similarGuestNames(a, b)).toContain("Similar spelling"));
  it.each([["Virginia Berg", "Sarah Berg"], ["The Smiths", "The Smith"], ["Sam & Jo", "Sam & Jon"], ["Amy Smith", "Ann Smith"], ["", "  "], ["V Berg", "Virginia Berg"]])("does not guess identity %s / %s", (a, b) => expect(similarGuestNames(a, b)).toBeNull());
  it("normalizes without changing displayed names", () => { expect(normalizedGuestName(" JOSÉ  O’Neil ")).toBe("jose oneil"); expect(findDuplicatePairs([older, latest]).pairs[0].older.guestName).toBe("Virginia Berg"); });
  it("recommends the latest update, not merely the latest submission", () => {
    const updated = { ...older, updatedAt: "2026-10-25T12:00:00Z" };
    expect(findDuplicatePairs([latest, updated]).pairs[0].latest.id).toBe(older.id);
    expect(findDuplicatePairs([older, latest]).pairs[0].latest.attending).toBe(false);
  });
  it("honors precise database ordering when JS milliseconds tie", () => {
    expect(findDuplicatePairs([{ ...older, recency: 1 }, { ...latest, recency: 2 }]).pairs[0].latest.id).toBe(older.id);
  });
  it("honors dismissed pairs in either order and bounds rendered reviews", () => {
    expect(findDuplicatePairs([older, latest], new Set([duplicatePairKey(latest.id, older.id)]))).toEqual({ pairs: [], total: 0 });
    const review = findDuplicatePairs(Array.from({ length: 12 }, (_, n) => ({ ...older, id: String(n) })));
    expect(review.total).toBe(66); expect(review.pairs).toHaveLength(50);
  });
  it("requires explicit merge confirmation and valid, distinct review identities", () => {
    const decision = { action: "merge", olderId: older.id, latestId: latest.id, olderVersion: older.version, latestVersion: latest.version, confirmed: true };
    expect(parseDuplicateDecision(decision)).toEqual(decision);
    for (const patch of [{ confirmed: false }, { confirmed: "true" }, { action: "delete" }, { olderId: latest.id }, { latestVersion: "bad" }, { olderId: "x" }]) expect(parseDuplicateDecision({ ...decision, ...patch })).toBeNull();
    expect(parseDuplicateDecision({ ...decision, action: "separate", confirmed: false })).not.toBeNull();
  });
  it("renders both responses privately with no immediate destructive confirmation button", () => {
    const html = renderToStaticMarkup(<DuplicateRsvpPanel initial={findDuplicatePairs([older, latest])} timeZone="America/New_York" guestsHref="/admin" />);
    expect(html).toContain("Latest response · keep"); expect(html).toContain("Can’t Make It"); expect(html).toContain("Party of 3");
    expect(html).toContain("Earlier note"); expect(html).toContain("Later note"); expect(html).toContain("Keep separate");
    expect(html).not.toContain("Confirm merge"); expect(html).not.toContain(older.version); expect(html).not.toContain("DATABASE_URL");
  });
  it("provides scoped dashboard links and an empty state", () => {
    expect(renderToStaticMarkup(<DuplicateRsvpLink id="test" count={1} />)).toContain('href="/admin/events/test/guests/duplicates"');
    expect(renderToStaticMarkup(<DuplicateRsvpLink count={2} />)).toContain("2 possible duplicate RSVP matches");
    expect(renderToStaticMarkup(<DuplicateRsvpPanel initial={{ pairs: [], total: 0 }} timeZone="UTC" guestsHref="/admin" />)).toContain("No possible duplicates");
  });
});
