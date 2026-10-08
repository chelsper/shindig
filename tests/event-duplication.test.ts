import { describe, expect, it } from "vitest";
import { duplicateEventPath, isDuplicationSource, suggestedDuplicateTitle, validateDuplicateEventInput } from "../lib/event-duplication";
import { eventId, otherEventId } from "./fixtures/publication";

const input = { source: eventId, requestId: otherEventId, fingerprint: "a".repeat(64), title: " Garden supper ", confirmed: true };
describe("private event duplication input", () => {
  it("normalizes only allowed fields, not client-provided event settings", () => {
    expect(validateDuplicateEventInput({ ...input, source: eventId.toUpperCase(), requestId: otherEventId.toUpperCase(), guests: ["private"], settings: {}, published: true })).toEqual({ ...input, title: "Garden supper" });
  });
  it.each([null, [], {}, { ...input, source: "event-someone-else" }, { ...input, requestId: eventId }, { ...input, requestId: eventId.toUpperCase() }, { ...input, fingerprint: "a" }, { ...input, fingerprint: "G".repeat(64) }, { ...input, confirmed: "true" }, { ...input, confirmed: false }, { ...input, title: " " }, { ...input, title: "a".repeat(181) }, { ...input, title: "Name\nOther" }, { ...input, title: 12 }])("rejects invalid or unconfirmed requests: %j", (value) => {
    expect(validateDuplicateEventInput(value)).toBeNull();
  });
  it("supports the one legacy source and proper UUIDs, not arbitrary URLs", () => {
    expect(isDuplicationSource("oyster-roast-2026")).toBe(true);
    expect(isDuplicationSource(eventId)).toBe(true);
    expect(isDuplicationSource("https://example.org")).toBe(false);
    expect(validateDuplicateEventInput({ ...input, source: "oyster-roast-2026" })?.source).toBe("oyster-roast-2026");
    expect(duplicateEventPath(eventId)).toBe(`/admin/events/duplicate/${eventId}`);
  });
  it("suggests a bounded editable copy name", () => {
    expect(suggestedDuplicateTitle("Garden Supper")).toBe("Garden Supper (copy)");
    expect(suggestedDuplicateTitle("a".repeat(180)).length).toBeLessThanOrEqual(180);
  });
});
