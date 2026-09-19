import "server-only";

import { neon } from "@neondatabase/serverless";

import type { ValidatedRsvp } from "./rsvp-validation";

export type SaveRsvpResult = "created" | "duplicate" | "disabled";

export async function saveRsvp(rsvp: ValidatedRsvp): Promise<SaveRsvpResult> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return "disabled";
  }

  const sql = neon(databaseUrl);
  const rows = await sql`
    INSERT INTO rsvps (
      id,
      event_slug,
      guest_name,
      attending,
      party_size,
      comment
    )
    VALUES (
      ${rsvp.id}::uuid,
      ${rsvp.eventSlug},
      ${rsvp.guestName},
      ${rsvp.attending},
      ${rsvp.partySize},
      ${rsvp.comment}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  return rows.length > 0 ? "created" : "duplicate";
}
