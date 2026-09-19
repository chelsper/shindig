import "server-only";
import { neon } from "@neondatabase/serverless";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import type { AdminPoll, PollInput, PollOption, PollResults, PublicPoll } from "../polls";
import type { GuestPollState } from "../guest-interactions";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Database access is not configured.");
  return neon(url);
}
type Row = Record<string, unknown>;
function options(value: unknown): PollOption[] {
  return (Array.isArray(value) ? value : []).map((item) => ({ key: String(item.key), text: String(item.text) }));
}
function results(value: unknown): PollResults | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Row;
  return { responses: Number(data.responses), options: (Array.isArray(data.options) ? data.options : []).map((item) => ({ key: String(item.key), count: Number(item.count) })) };
}
function publicPoll(row: Row): PublicPoll {
  return { key: String(row.key), question: String(row.question), eyebrow: row.eyebrow == null ? null : String(row.eyebrow), status: row.status as PublicPoll["status"], allowMultiple: Boolean(row.allowMultiple), showResults: Boolean(row.showResults), options: options(row.options), results: results(row.results) };
}

export async function listPublicPolls(): Promise<PublicPoll[]> {
  if (!OYSTER_ROAST_EVENT.features.polls) return [];
  const sql = database();
  const rows = await sql`
    SELECT p.public_key AS key, p.question, p.eyebrow, p.status, p.allow_multiple AS "allowMultiple",
      p.show_results AS "showResults", t.options,
      CASE WHEN p.status = 'CLOSED' AND p.show_closed_results
        THEN jsonb_build_object('responses', t.responses, 'options', t.counts) ELSE NULL END AS results
    FROM polls p JOIN shindig_poll_totals t ON t.poll_id = p.id
    WHERE p.event_slug = ${OYSTER_ROAST_EVENT.slug}
      AND (p.status = 'OPEN' OR (p.status = 'CLOSED' AND p.show_closed_results))
    ORDER BY CASE WHEN p.status = 'OPEN' THEN 0 ELSE 1 END, p.sort_order, p.created_at DESC, p.id
  `;
  return rows.map(publicPoll);
}

export async function listGuestPollStates(hash: string): Promise<Record<string, GuestPollState>> {
  const sql = database();
  const rows = await sql`
    SELECT p.public_key AS key,
      (SELECT jsonb_agg(o.public_key ORDER BY o.sort_order, o.id) FROM poll_votes v
        JOIN poll_options o ON o.id = v.poll_option_id WHERE v.poll_id = p.id AND v.voter_token_hash = ${hash}) AS selected,
      CASE WHEN (p.status = 'OPEN' AND p.show_results) OR (p.status = 'CLOSED' AND p.show_closed_results)
        THEN jsonb_build_object('responses', t.responses, 'options', t.counts) ELSE NULL END AS results
    FROM polls p JOIN shindig_poll_totals t ON t.poll_id = p.id
    WHERE p.event_slug = ${OYSTER_ROAST_EVENT.slug}
      AND (p.status = 'OPEN' OR (p.status = 'CLOSED' AND p.show_closed_results))
      AND EXISTS (SELECT 1 FROM poll_votes v WHERE v.poll_id = p.id AND v.voter_token_hash = ${hash})
  `;
  return Object.fromEntries(rows.map((row) => [String(row.key), { selected: Array.isArray(row.selected) ? row.selected.map(String) : [], results: results(row.results) }]));
}

export async function setPollVote(key: string, selected: string[], hash: string): Promise<boolean> {
  const sql = database();
  const rows = await sql`SELECT shindig_set_poll_vote(${OYSTER_ROAST_EVENT.slug}, ${key}::uuid, ${selected}::uuid[], ${hash}) AS saved`;
  return rows[0]?.saved === true;
}

export async function listPollsForAdmin(): Promise<AdminPoll[]> {
  const sql = database();
  const rows = await sql`
    SELECT p.public_key AS key, p.question, p.eyebrow, p.status, p.allow_multiple AS "allowMultiple",
      p.show_results AS "showResults", p.show_closed_results AS "showClosedResults", p.sort_order AS "sortOrder",
      (p.voting_started_at IS NOT NULL) AS "votingStarted", t.options,
      jsonb_build_object('responses', t.responses, 'options', t.counts) AS results
    FROM polls p JOIN shindig_poll_totals t ON t.poll_id = p.id
    WHERE p.event_slug = ${OYSTER_ROAST_EVENT.slug}
    ORDER BY CASE WHEN p.status = 'ARCHIVED' THEN 1 ELSE 0 END, p.sort_order, p.created_at DESC, p.id
  `;
  return rows.map((row) => ({ ...publicPoll(row), status: row.status as AdminPoll["status"], showClosedResults: Boolean(row.showClosedResults), sortOrder: Number(row.sortOrder), votingStarted: Boolean(row.votingStarted), results: results(row.results)! }));
}

export async function savePoll(key: string, input: PollInput, create: boolean): Promise<boolean> {
  const sql = database();
  const rows = await sql`SELECT shindig_save_poll(${OYSTER_ROAST_EVENT.slug}, ${key}::uuid,
    ${input.question}, ${input.eyebrow}, ${input.allowMultiple}, ${input.showResults}, ${input.showClosedResults},
    ${input.sortOrder}, ${JSON.stringify(input.options)}::jsonb, ${create}) AS saved`;
  return rows[0]?.saved === true;
}

export async function changePollStatus(key: string, status: "OPEN" | "CLOSED" | "ARCHIVED" | "DELETE_DRAFT"): Promise<boolean> {
  const sql = database();
  const rows = await sql`SELECT shindig_poll_status(${OYSTER_ROAST_EVENT.slug}, ${key}::uuid, ${status}) AS saved`;
  return rows[0]?.saved === true;
}
