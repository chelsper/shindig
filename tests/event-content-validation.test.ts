import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { isContentId, validateGuestQuestion, validateHostAnswer, validateHostUpdate } from "../lib/server/event-content-validation";

const requestToken = "9d366c85-1b73-4c3e-99e8-e751d75965aa";

describe("event content validation", () => {
  it("trims host updates and allows a blank optional heading", () => {
    expect(validateHostUpdate({ heading: "  Hello  ", message: "  See you soon!  " })).toEqual({ success: true, data: { heading: "Hello", message: "See you soon!" } });
    expect(validateHostUpdate({ heading: "  ", message: "Hello" })).toMatchObject({ success: true, data: { heading: null } });
  });

  it.each([null, [], { message: "  " }, { message: 2 }, { heading: true, message: "Hello" }, { heading: "x".repeat(121), message: "Hello" }, { message: "x".repeat(3001) }])("rejects invalid updates: %j", (input) => {
    expect(validateHostUpdate(input).success).toBe(false);
  });

  it("accepts a question without a name, strips unauthorized publication fields", () => {
    expect(validateGuestQuestion({ requestToken, question: "  Can I bring a chair?  ", guestName: "  ", answer: "Forged answer", isPublished: true, eventSlug: "another-event" })).toEqual({ success: true, data: { requestToken, question: "Can I bring a chair?", guestName: null } });
    expect(validateGuestQuestion({ requestToken, question: "Hello?", guestName: " Pat " })).toMatchObject({ success: true, data: { guestName: "Pat" } });
  });

  it.each([null, [], { question: "?" }, { requestToken: "invalid", question: "?" }, { requestToken, question: " " }, { requestToken, question: 12 }, { requestToken, question: "x".repeat(1001) }, { requestToken, question: "?", guestName: true }, { requestToken, question: "?", guestName: "x".repeat(81) }])("rejects invalid questions: %j", (input) => {
    expect(validateGuestQuestion(input).success).toBe(false);
  });

  it("allows a private draft or clearing an unpublished answer", () => {
    expect(validateHostAnswer({ answer: " Not sure yet ", isPublished: false })).toEqual({ success: true, data: { answer: "Not sure yet", isPublished: false } });
    expect(validateHostAnswer({ answer: " ", isPublished: false })).toEqual({ success: true, data: { answer: null, isPublished: false } });
  });

  it("requires an answer and explicit boolean choice for publication", () => {
    expect(validateHostAnswer({ answer: " Yes! ", isPublished: true })).toEqual({ success: true, data: { answer: "Yes!", isPublished: true } });
    for (const input of [{ answer: " " , isPublished: true }, { answer: null, isPublished: true }, { answer: "yes" }, { answer: "yes", isPublished: "true" }, { answer: 12, isPublished: false }, { answer: "x".repeat(2001), isPublished: false }]) {
      expect(validateHostAnswer(input).success).toBe(false);
    }
  });

  it("accepts exact limits and only valid UUID content identifiers", () => {
    expect(validateHostUpdate({ heading: "x".repeat(120), message: "x".repeat(3000) }).success).toBe(true);
    expect(validateGuestQuestion({ requestToken, question: "x".repeat(1000), guestName: "x".repeat(80) }).success).toBe(true);
    expect(validateHostAnswer({ answer: "x".repeat(2000), isPublished: true }).success).toBe(true);
    expect(isContentId(requestToken)).toBe(true);
    expect(isContentId("1")).toBe(false);
    expect(isContentId(null)).toBe(false);
  });
});
