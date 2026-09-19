import "server-only";

import { QUESTION_LIMITS } from "../questions";
import { UPDATE_LIMITS } from "../updates";

type Result<T> = { success: true; data: T } | { success: false; message: string };
export type UpdateInput = { heading: string | null; message: string };
export type QuestionInput = { requestToken: string; question: string; guestName: string | null };
export type AnswerInput = { answer: string | null; isPublished: boolean };

export function isContentId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fields(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function optionalText(value: unknown): string | null | false {
  if (value == null) return null;
  return typeof value === "string" ? value.trim() || null : false;
}

export function validateHostUpdate(input: unknown): Result<UpdateInput> {
  const value = fields(input);
  if (!value) return { success: false, message: "Please check your update." };
  const heading = optionalText(value.heading);
  if (heading === false || (heading && heading.length > UPDATE_LIMITS.heading)) {
    return { success: false, message: `Keep the heading to ${UPDATE_LIMITS.heading} characters or fewer, or leave it blank.` };
  }
  if (typeof value.message !== "string" || !value.message.trim()) {
    return { success: false, message: "Please write a message for your guests." };
  }
  const message = value.message.trim();
  if (message.length > UPDATE_LIMITS.message) {
    return { success: false, message: `Keep your update to ${UPDATE_LIMITS.message.toLocaleString("en-US")} characters or fewer.` };
  }
  return { success: true, data: { heading, message } };
}

export function validateGuestQuestion(input: unknown): Result<QuestionInput> {
  const value = fields(input);
  if (!value || !isContentId(value.requestToken)) {
    return { success: false, message: "Please refresh the page and try again." };
  }
  if (typeof value.question !== "string" || !value.question.trim()) {
    return { success: false, message: "What would you like to ask?" };
  }
  const question = value.question.trim();
  if (question.length > QUESTION_LIMITS.question) {
    return { success: false, message: `Keep your question to ${QUESTION_LIMITS.question.toLocaleString("en-US")} characters or fewer.` };
  }
  const guestName = optionalText(value.guestName);
  if (guestName === false || (guestName && guestName.length > QUESTION_LIMITS.guestName)) {
    return { success: false, message: `Keep your name to ${QUESTION_LIMITS.guestName} characters or fewer, or leave it blank.` };
  }
  // Guest-supplied answers, publication flags, and event slugs are never accepted.
  return { success: true, data: { requestToken: value.requestToken, question, guestName } };
}

export function validateHostAnswer(input: unknown): Result<AnswerInput> {
  const value = fields(input);
  if (!value || typeof value.isPublished !== "boolean") {
    return { success: false, message: "Please choose whether to publish this answer." };
  }
  const answer = optionalText(value.answer);
  if (answer === false || (answer && answer.length > QUESTION_LIMITS.answer)) {
    return { success: false, message: `Keep your answer to ${QUESTION_LIMITS.answer.toLocaleString("en-US")} characters or fewer.` };
  }
  if (value.isPublished && !answer) {
    return { success: false, message: "Write an answer before publishing this question." };
  }
  return { success: true, data: { answer, isPublished: value.isPublished } };
}
