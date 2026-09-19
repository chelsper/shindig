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

export type RsvpFilter = "all" | "attending" | "declined";

export type AdminRsvp = SavedRsvp & {
  eventSlug: string;
  createdAt: string;
  updatedAt: string;
};

export type RsvpSummary = {
  totalAttending: number;
  totalResponses: number;
  declined: number;
  totalPartySize: number;
};

const OYSTER_ROAST_SLUG = "oyster-roast-2026";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("Database access is not configured.");
  }

  return databaseUrl;
}

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

export async function getRsvpSummary(): Promise<RsvpSummary> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE attending)::int AS "totalAttending",
      COUNT(*)::int AS "totalResponses",
      COUNT(*) FILTER (WHERE NOT attending)::int AS declined,
      COALESCE(SUM(party_size) FILTER (WHERE attending), 0)::int AS "totalPartySize"
    FROM rsvps
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
  `;
  const summary = rows[0] as Partial<RsvpSummary> | undefined;

  return {
    totalAttending: Number(summary?.totalAttending ?? 0),
    totalResponses: Number(summary?.totalResponses ?? 0),
    declined: Number(summary?.declined ?? 0),
    totalPartySize: Number(summary?.totalPartySize ?? 0),
  };
}

export async function listRsvps(filter: RsvpFilter = "all"): Promise<AdminRsvp[]> {
  const sql = neon(getDatabaseUrl());
  const attendanceFilter =
    filter === "attending" ? true : filter === "declined" ? false : null;
  const rows = await sql`
    SELECT
      id::text AS id,
      event_slug AS "eventSlug",
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      comment,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM rsvps
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND (${attendanceFilter}::boolean IS NULL OR attending = ${attendanceFilter})
    ORDER BY created_at DESC
  `;

  return rows.map((row) => {
    const rsvp = row as Omit<AdminRsvp, "createdAt" | "updatedAt"> & {
      createdAt: string | Date;
      updatedAt: string | Date;
    };

    return {
      ...rsvp,
      createdAt: new Date(rsvp.createdAt).toISOString(),
      updatedAt: new Date(rsvp.updatedAt).toISOString(),
    };
  });
}
