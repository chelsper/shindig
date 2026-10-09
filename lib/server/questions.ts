import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_SCOPE, requireHostEventScope, eventScopeSlug, eventFeatureEnabled, requireEventFeature, type EventScope } from "./event-scope";
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

export async function listPublicQuestions(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<PublicQuestion[]> {
  const eventSlug = eventScopeSlug(scope);
  if (!eventFeatureEnabled(scope, "questions")) return [];
  const sql = database();
  const rows = await sql`
    SELECT question, answer
    FROM event_questions
    WHERE event_slug = ${eventSlug}
      AND is_published = true
      AND answer IS NOT NULL AND char_length(btrim(answer)) > 0
      AND published_at IS NOT NULL
      AND (event_slug = 'oyster-roast-2026' OR EXISTS (
        SELECT 1 FROM event_publications p WHERE p.slug = event_questions.event_slug
          AND p.visibility = 'published' AND p.snapshot #>> '{settings,features,questions}' = 'true'
      ))
    ORDER BY published_at DESC, id DESC
  `;
  // Private names, pending records, IDs, and timestamps never enter public props.
  return rows.map((row) => ({ question: String(row.question), answer: String(row.answer) }));
}

export async function insertGuestQuestion(input: QuestionInput, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<void> {
  const eventSlug = eventScopeSlug(scope);
  requireEventFeature(scope, "questions");
  const sql = database();
  // Keep existing live retry hashes valid across a rolling deployment. Other
  // events namespace the token, so one browser retry key can be used per event.
  const token = input.requestToken.toLowerCase();
  const submissionHash = createHash("sha256").update(eventSlug === OYSTER_ROAST_SCOPE.slug ? token : `${eventSlug}:${token}`).digest("hex");
  await sql`
    INSERT INTO event_questions (id, event_slug, question, guest_name, submission_hash, answer, is_published, published_at)
    VALUES (${randomUUID()}::uuid, ${eventSlug}, ${input.question}, ${input.guestName}, ${submissionHash}, NULL, false, NULL)
    ON CONFLICT (submission_hash) DO NOTHING
  `;
}

export async function listQuestionsForAdmin(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<AdminQuestion[]> {
  await requireHostEventScope(scope);
  const eventSlug = eventScopeSlug(scope);
  const sql = database();
  const rows = await sql`
    SELECT id::text, question, guest_name AS "guestName", answer,
      is_published AS "isPublished", created_at AS "createdAt"
    FROM event_questions WHERE event_slug = ${eventSlug}
    ORDER BY created_at DESC, id DESC
  `;
  return rows.map((row) => ({
    id: String(row.id), question: String(row.question),
    guestName: row.guestName == null ? null : String(row.guestName),
    answer: row.answer == null ? null : String(row.answer),
    isPublished: Boolean(row.isPublished), createdAt: new Date(row.createdAt).toISOString(),
  }));
}

export async function saveQuestionAnswer(id: string, input: AnswerInput, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<boolean> {
  await requireHostEventScope(scope);
  const eventSlug = eventScopeSlug(scope);
  const sql = database();
  const rows = await sql`
    UPDATE event_questions
    SET answer = ${input.answer}, is_published = ${input.isPublished},
      published_at = CASE WHEN ${input.isPublished} THEN COALESCE(published_at, now()) ELSE NULL END,
      updated_at = now()
    WHERE event_slug = ${eventSlug} AND id = ${id}::uuid
    RETURNING 1 AS updated
  `;
  return rows.length > 0;
}

export async function removeQuestion(id: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<void> {
  await requireHostEventScope(scope);
  const eventSlug = eventScopeSlug(scope);
  const sql = database();
  await sql`DELETE FROM event_questions WHERE event_slug = ${eventSlug} AND id = ${id}::uuid`;
}
