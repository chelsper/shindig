import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import type { PublicQuestion } from "../questions";
import type { AnswerInput, QuestionInput } from "./event-content-validation";

export type AdminQuestion = {
  id: string;
  question: string;
  guestName: string | null;
  answer: string | null;
  isPublished: boolean;
  createdAt: string;
};

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Database access is not configured.");
  return neon(url);
}

export async function listPublicQuestions(): Promise<PublicQuestion[]> {
  if (!OYSTER_ROAST_EVENT.features.questions) return [];
  const sql = database();
  const rows = await sql`
    SELECT question, answer
    FROM event_questions
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
      AND is_published = true
      AND answer IS NOT NULL AND char_length(btrim(answer)) > 0
      AND published_at IS NOT NULL
    ORDER BY published_at DESC, id DESC
  `;
  // Private names, pending records, IDs, and timestamps never enter public props.
  return rows.map((row) => ({ question: String(row.question), answer: String(row.answer) }));
}

export async function insertGuestQuestion(input: QuestionInput): Promise<void> {
  const sql = database();
  const submissionHash = createHash("sha256").update(input.requestToken.toLowerCase()).digest("hex");
  await sql`
    INSERT INTO event_questions (id, event_slug, question, guest_name, submission_hash, answer, is_published, published_at)
    VALUES (${randomUUID()}::uuid, ${OYSTER_ROAST_EVENT.slug}, ${input.question}, ${input.guestName}, ${submissionHash}, NULL, false, NULL)
    ON CONFLICT (submission_hash) DO NOTHING
  `;
}

export async function listQuestionsForAdmin(): Promise<AdminQuestion[]> {
  const sql = database();
  const rows = await sql`
    SELECT id::text, question, guest_name AS "guestName", answer,
      is_published AS "isPublished", created_at AS "createdAt"
    FROM event_questions WHERE event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY created_at DESC, id DESC
  `;
  return rows.map((row) => ({
    id: String(row.id), question: String(row.question),
    guestName: row.guestName == null ? null : String(row.guestName),
    answer: row.answer == null ? null : String(row.answer),
    isPublished: Boolean(row.isPublished), createdAt: new Date(row.createdAt).toISOString(),
  }));
}

export async function saveQuestionAnswer(id: string, input: AnswerInput): Promise<boolean> {
  const sql = database();
  const rows = await sql`
    UPDATE event_questions
    SET answer = ${input.answer}, is_published = ${input.isPublished},
      published_at = CASE WHEN ${input.isPublished} THEN COALESCE(published_at, now()) ELSE NULL END,
      updated_at = now()
    WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} AND id = ${id}::uuid
    RETURNING 1 AS updated
  `;
  return rows.length > 0;
}

export async function removeQuestion(id: string): Promise<void> {
  const sql = database();
  await sql`DELETE FROM event_questions WHERE event_slug = ${OYSTER_ROAST_EVENT.slug} AND id = ${id}::uuid`;
}
