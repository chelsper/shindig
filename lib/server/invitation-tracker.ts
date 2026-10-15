import "server-only";
import { neon } from "@neondatabase/serverless";
import { eventScopeSlug, requireHostEventScope, OYSTER_ROAST_SCOPE, type EventScope } from "./event-scope";
import { validateInvitationChange, type InvitationTracker, type TrackerResponse } from "../invitation-tracker";

export class InvitationTrackerError extends Error {}
const conflict = "This entry changed or is no longer available. Refresh the tracker before trying again.";
async function privateDatabase(scope: EventScope) {
  await requireHostEventScope(scope);
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Invitation storage unavailable.");
  return { sql: neon(url), slug: eventScopeSlug(scope) };
}

// No public entry point: both page loading and every action enforce host scope.
// Only the response fields needed for an explicit match are selected.
export async function listInvitationTracker(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<InvitationTracker> {
  const { sql, slug } = await privateDatabase(scope);
  const rows = await sql`SELECT i.id,i.guest_name AS "guestName",i.email,i.phone,i.invited_at IS NOT NULL AS invited,i.revision,
    r.id AS "responseId",r.guest_name AS "responseName",r.attending,r.party_size AS "partySize"
    FROM event_invitees i LEFT JOIN rsvps r ON r.id=i.rsvp_id AND r.event_slug=i.event_slug
    WHERE i.event_slug=${slug} ORDER BY i.created_at DESC,i.id`;
  const responses = await sql`SELECT id,guest_name AS "guestName",attending,party_size AS "partySize"
    FROM rsvps WHERE event_slug=${slug} ORDER BY lower(guest_name),id`;
  const response = (r: Record<string, unknown>): TrackerResponse => ({ id: String(r.id), guestName: String(r.guestName), attending: r.attending === true, partySize: r.partySize == null ? null : Number(r.partySize) });
  return {
    invitees: rows.map(r => ({ id: String(r.id), guestName: String(r.guestName), email: r.email as string | null, phone: r.phone as string | null,
      invited: r.invited === true, revision: Number(r.revision), response: r.responseId ? response({ ...r, id: r.responseId, guestName: r.responseName }) : null })),
    responses: responses.map(response),
  };
}

export async function changeInvitationRecord(input: unknown, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<void> {
  const { sql, slug } = await privateDatabase(scope);
  const parsed = validateInvitationChange(input);
  if (!parsed.ok) throw new InvitationTrackerError(parsed.message);
  const v = parsed.change;
  let rows;
  try {
    if (v.kind === "save" && v.revision === 0) {
      rows = await sql`INSERT INTO event_invitees(id,event_slug,guest_name,email,phone,invited_at)
        VALUES(${v.id}::uuid,${slug},${v.guestName},${v.email},${v.phone},CASE WHEN ${v.invited} THEN clock_timestamp() ELSE NULL END)
        ON CONFLICT(id) DO NOTHING RETURNING id`;
      if (rows.length) return;
      // A lost-response retry acknowledges an identical first save only. It
      // never overwrites a newer edit, another event, or a confirmed RSVP link.
      rows = await sql`SELECT id FROM event_invitees WHERE id=${v.id}::uuid AND event_slug=${slug} AND revision=1
        AND guest_name=${v.guestName} AND email IS NOT DISTINCT FROM ${v.email} AND phone IS NOT DISTINCT FROM ${v.phone}
        AND (invited_at IS NOT NULL)=${v.invited} AND rsvp_id IS NULL`;
    } else if (v.kind === "save") {
      rows = await sql`UPDATE event_invitees SET guest_name=${v.guestName},email=${v.email},phone=${v.phone},
        invited_at=CASE WHEN ${v.invited} THEN coalesce(invited_at,clock_timestamp()) ELSE NULL END,
        revision=revision+1,updated_at=clock_timestamp() WHERE id=${v.id}::uuid AND event_slug=${slug} AND revision=${v.revision} RETURNING id`;
    } else if (v.kind === "sent") {
      rows = await sql`UPDATE event_invitees SET invited_at=CASE WHEN ${v.invited} THEN coalesce(invited_at,clock_timestamp()) ELSE NULL END,
        revision=revision+1,updated_at=clock_timestamp() WHERE id=${v.id}::uuid AND event_slug=${slug} AND revision=${v.revision} RETURNING id`;
    } else if (v.kind === "link" || v.kind === "unlink") {
      rows = await sql`UPDATE event_invitees SET rsvp_id=${v.kind === "link" ? v.rsvpId : null}::uuid,
        revision=revision+1,updated_at=clock_timestamp() WHERE id=${v.id}::uuid AND event_slug=${slug} AND revision=${v.revision} RETURNING id`;
    } else {
      rows = await sql`DELETE FROM event_invitees WHERE id=${v.id}::uuid AND event_slug=${slug} AND revision=${v.revision} RETURNING id`;
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new InvitationTrackerError("That RSVP is already linked to another invitee. Refresh the tracker to review the match.");
    if (code === "23503") throw new InvitationTrackerError("That RSVP isn’t available for this event. Refresh the tracker and choose again.");
    throw error;
  }
  if (!rows.length) throw new InvitationTrackerError(conflict);
}
