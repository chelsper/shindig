import "server-only";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_SCOPE, requireHostEventScope, eventScopeSlug, type EventScope } from "./event-scope";
import { duplicatePairKey, findDuplicatePairs, parseDuplicateDecision, DuplicateReviewError, type DuplicateResponse, type DuplicateReview } from "../rsvp-duplicates";

async function database(scope: EventScope) {
  await requireHostEventScope(scope);
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("RSVP storage unavailable.");
  return { sql: neon(url), slug: eventScopeSlug(scope) };
}
export async function listPossibleDuplicateRsvps(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<DuplicateReview> {
  const { sql, slug } = await database(scope);
  const rows = await sql`SELECT id,guest_name AS "guestName",attending,party_size AS "partySize",display_on_guest_list AS "displayOnGuestList",
    comment,created_at AS "createdAt",updated_at AS "updatedAt",shindig_rsvp_review_version(id) AS version,
    row_number() OVER (ORDER BY updated_at DESC,created_at DESC,id DESC)::int AS recency FROM rsvps WHERE event_slug=${slug}`;
  const dismissed = await sql`SELECT first_id,second_id FROM rsvp_duplicate_dismissals WHERE event_slug=${slug}
    AND first_version=shindig_rsvp_review_version(first_id) AND second_version=shindig_rsvp_review_version(second_id)`;
  const responses: DuplicateResponse[] = rows.map(r => ({ id: String(r.id), guestName: String(r.guestName), attending: r.attending === true,
    partySize: r.partySize == null ? null : Number(r.partySize), displayOnGuestList: r.displayOnGuestList === true, comment: r.comment as string | null,
    createdAt: new Date(r.createdAt as string).toISOString(), updatedAt: new Date(r.updatedAt as string).toISOString(), version: String(r.version), recency: Number(r.recency) }));
  return findDuplicatePairs(responses, new Set(dismissed.map(r => duplicatePairKey(String(r.first_id), String(r.second_id)))));
}
export async function decideRsvpDuplicate(input: unknown, scope: EventScope = OYSTER_ROAST_SCOPE) {
  const { sql, slug } = await database(scope);
  const v = parseDuplicateDecision(input);
  if (!v) throw new DuplicateReviewError("Please review both responses and confirm before merging.");
  const rows = await sql`SELECT shindig_review_rsvp_duplicate(${slug},${v.olderId}::uuid,${v.latestId}::uuid,${v.olderVersion},${v.latestVersion},${v.action}) AS status`;
  const status = rows[0]?.status;
  if (status === "linked") throw new DuplicateReviewError("Both responses are linked to separate invitation-tracker entries. Review those links and unlink one before merging; your planning entries won’t be deleted.");
  if (status === "stale" || status === "missing") throw new DuplicateReviewError("One of these responses changed or is no longer available. Refresh the review before deciding.");
  if (status !== "merged" && status !== "separate") throw new Error("Review could not be saved.");
  return status;
}
