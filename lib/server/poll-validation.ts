import "server-only";
import { isPublicKey } from "../guest-interactions";
import { POLL_LIMITS, type PollInput, type PollOption } from "../polls";
type Validation<T> = { ok: true; data: T } | { ok: false; message: string };
const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function validatePoll(input: unknown): Validation<PollInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please check the poll details." };
  const fields = input as Record<string, unknown>;
  if (typeof fields.question !== "string" || !clean(fields.question) || clean(fields.question).length > POLL_LIMITS.question) return { ok: false, message: "Add a question of 240 characters or fewer." };
  if (fields.eyebrow != null && (typeof fields.eyebrow !== "string" || clean(fields.eyebrow).length > POLL_LIMITS.eyebrow)) return { ok: false, message: "Keep the label to 60 characters or fewer." };
  if (typeof fields.allowMultiple !== "boolean" || typeof fields.showResults !== "boolean" || typeof fields.showClosedResults !== "boolean") return { ok: false, message: "Please check the voting and results settings." };
  if (typeof fields.sortOrder !== "number" || !Number.isInteger(fields.sortOrder) || fields.sortOrder < 0 || fields.sortOrder > 999) return { ok: false, message: "Choose a display order from 0 to 999." };
  if (!Array.isArray(fields.options) || fields.options.length < POLL_LIMITS.minOptions || fields.options.length > POLL_LIMITS.maxOptions) return { ok: false, message: "Include between 2 and 10 options." };
  const options: PollOption[] = [];
  for (const item of fields.options) {
    if (!item || typeof item !== "object" || !isPublicKey(item.key) || typeof item.text !== "string" || !clean(item.text) || clean(item.text).length > POLL_LIMITS.option) return { ok: false, message: "Give each option 1–100 characters." };
    options.push({ key: item.key.toLowerCase(), text: clean(item.text) });
  }
  if (new Set(options.map((o) => o.key)).size !== options.length || new Set(options.map((o) => o.text.toLowerCase())).size !== options.length) return { ok: false, message: "Please use different options for each answer." };
  return { ok: true, data: { question: clean(fields.question), eyebrow: typeof fields.eyebrow === "string" ? clean(fields.eyebrow) || null : null, allowMultiple: fields.allowMultiple, showResults: fields.showResults, showClosedResults: fields.showClosedResults, sortOrder: fields.sortOrder, options } };
}

export function validatePollVote(key: unknown, options: unknown): Validation<{ key: string; options: string[] }> {
  if (!isPublicKey(key) || !Array.isArray(options) || options.length < 1 || options.length > POLL_LIMITS.maxOptions || !options.every(isPublicKey) || new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, message: "Choose an answer before voting." };
  return { ok: true, data: { key: key.toLowerCase(), options: options.map((o) => o.toLowerCase()) } };
}
