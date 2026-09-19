import "server-only";

import { neon } from "@neondatabase/serverless";

import type { ValidatedRsvp } from "./rsvp-validation";

export type SavedRsvp = {
  id: string;
  guestName: string;
  attending: boolean;
  partySize: number | null;
  comment: string | null;
};

export type SaveRsvpResult =
  | { status: "created" | "duplicate"; rsvp: SavedRsvp }
  | { status: "disabled" };

export async function saveRsvp(rsvp: ValidatedRsvp): Promise<SaveRsvpResult> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return { status: "disabled" };
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
    RETURNING
      id::text AS id,
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      comment
  `;

  const createdRsvp = rows[0] as SavedRsvp | undefined;

  if (createdRsvp) {
    return { status: "created", rsvp: createdRsvp };
  }

  const existingRows = await sql`
    SELECT
      id::text AS id,
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      comment
    FROM rsvps
    WHERE id = ${rsvp.id}::uuid
    LIMIT 1
  `;
  const existingRsvp = existingRows[0] as SavedRsvp | undefined;

  if (!existingRsvp) {
    throw new Error("The saved RSVP could not be confirmed.");
  }

  return { status: "duplicate", rsvp: existingRsvp };
}
