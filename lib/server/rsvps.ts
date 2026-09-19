import "server-only";

import { neon } from "@neondatabase/serverless";

import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import type {
  ValidatedRsvp,
  ValidatedRsvpUpdate,
} from "./rsvp-validation";

export type SavedRsvp = {
  id: string;
  guestName: string;
  attending: boolean;
  partySize: number | null;
  displayOnGuestList: boolean;
  comment: string | null;
};

export type GuestRsvp = Omit<SavedRsvp, "id">;

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

export type PublicGuestListGuest = {
  guestName: string;
  partySize: number;
};

export type PublicGuestList = {
  totalGuestCount: number;
  guests: PublicGuestListGuest[];
};

type DatabaseAdminRsvp = Omit<AdminRsvp, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

const OYSTER_ROAST_SLUG = OYSTER_ROAST_EVENT.slug;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("Database access is not configured.");
  }

  return databaseUrl;
}

function withoutEditTokenHash(
  rsvp: SavedRsvp & { editTokenHash: string | null },
): SavedRsvp {
  return {
    id: rsvp.id,
    guestName: rsvp.guestName,
    attending: rsvp.attending,
    partySize: rsvp.partySize,
    displayOnGuestList: rsvp.displayOnGuestList,
    comment: rsvp.comment,
  };
}

function normalizeAdminRsvp(rsvp: DatabaseAdminRsvp): AdminRsvp {
  return {
    ...rsvp,
    createdAt: new Date(rsvp.createdAt).toISOString(),
    updatedAt: new Date(rsvp.updatedAt).toISOString(),
  };
}

export async function saveRsvp(
  rsvp: ValidatedRsvp,
  editTokenHash: string,
): Promise<SaveRsvpResult> {
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
      display_on_guest_list,
      comment,
      edit_token_hash
    )
    VALUES (
      ${rsvp.id}::uuid,
      ${rsvp.eventSlug},
      ${rsvp.guestName},
      ${rsvp.attending},
      ${rsvp.partySize},
      ${rsvp.displayOnGuestList},
      ${rsvp.comment},
      ${editTokenHash}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING
      id::text AS id,
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      display_on_guest_list AS "displayOnGuestList",
      comment,
      edit_token_hash AS "editTokenHash"
  `;

  const createdRsvp = rows[0] as (SavedRsvp & { editTokenHash: string }) | undefined;

  if (createdRsvp) {
    return { status: "created", rsvp: withoutEditTokenHash(createdRsvp) };
  }

  const existingRows = await sql`
    SELECT
      id::text AS id,
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      display_on_guest_list AS "displayOnGuestList",
      comment,
      edit_token_hash AS "editTokenHash"
    FROM rsvps
    WHERE id = ${rsvp.id}::uuid
    LIMIT 1
  `;
  const existingRsvp = existingRows[0] as
    | (SavedRsvp & { editTokenHash: string | null })
    | undefined;

  if (!existingRsvp || existingRsvp.editTokenHash !== editTokenHash) {
    throw new Error("The saved RSVP could not be confirmed.");
  }

  return { status: "duplicate", rsvp: withoutEditTokenHash(existingRsvp) };
}

export async function getRsvpForGuest(
  editTokenHash: string,
): Promise<GuestRsvp | null> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    SELECT
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      display_on_guest_list AS "displayOnGuestList",
      comment
    FROM rsvps
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND edit_token_hash = ${editTokenHash}
    LIMIT 1
  `;

  return (rows[0] as GuestRsvp | undefined) ?? null;
}

export async function updateRsvpForGuest(
  editTokenHash: string,
  rsvp: ValidatedRsvpUpdate,
): Promise<GuestRsvp | null> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    UPDATE rsvps
    SET
      guest_name = ${rsvp.guestName},
      attending = ${rsvp.attending},
      party_size = ${rsvp.partySize},
      display_on_guest_list = ${rsvp.displayOnGuestList},
      comment = ${rsvp.comment},
      updated_at = now()
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND edit_token_hash = ${editTokenHash}
    RETURNING
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      display_on_guest_list AS "displayOnGuestList",
      comment
  `;

  return (rows[0] as GuestRsvp | undefined) ?? null;
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
      display_on_guest_list AS "displayOnGuestList",
      comment,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM rsvps
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND (${attendanceFilter}::boolean IS NULL OR attending = ${attendanceFilter})
    ORDER BY created_at DESC
  `;

  return rows.map((row) => normalizeAdminRsvp(row as DatabaseAdminRsvp));
}

export async function getRsvpForAdmin(id: string): Promise<AdminRsvp | null> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    SELECT
      id::text AS id,
      event_slug AS "eventSlug",
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      display_on_guest_list AS "displayOnGuestList",
      comment,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM rsvps
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND id = ${id}::uuid
    LIMIT 1
  `;
  const rsvp = rows[0] as DatabaseAdminRsvp | undefined;

  return rsvp ? normalizeAdminRsvp(rsvp) : null;
}

export async function createRsvpForAdmin(
  id: string,
  rsvp: ValidatedRsvpUpdate,
): Promise<void> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    INSERT INTO rsvps (
      id,
      event_slug,
      guest_name,
      attending,
      party_size,
      display_on_guest_list,
      comment
    )
    VALUES (
      ${id}::uuid,
      ${OYSTER_ROAST_SLUG},
      ${rsvp.guestName},
      ${rsvp.attending},
      ${rsvp.partySize},
      ${rsvp.displayOnGuestList},
      ${rsvp.comment}
    )
    RETURNING id
  `;

  if (!rows[0]) throw new Error("The RSVP could not be created.");
}

export async function updateRsvpForAdmin(
  id: string,
  rsvp: ValidatedRsvpUpdate,
): Promise<boolean> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    UPDATE rsvps
    SET
      guest_name = ${rsvp.guestName},
      attending = ${rsvp.attending},
      party_size = ${rsvp.partySize},
      display_on_guest_list = ${rsvp.displayOnGuestList},
      comment = ${rsvp.comment},
      updated_at = now()
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND id = ${id}::uuid
    RETURNING id
  `;

  return Boolean(rows[0]);
}

export async function deleteRsvpForAdmin(id: string): Promise<boolean> {
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    DELETE FROM rsvps
    WHERE event_slug = ${OYSTER_ROAST_SLUG}
      AND id = ${id}::uuid
    RETURNING id
  `;

  return Boolean(rows[0]);
}

export async function getPublicGuestList(): Promise<PublicGuestList> {
  const sql = neon(getDatabaseUrl());
  const [totalRows, guestRows] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(party_size), 0)::int AS "totalGuestCount"
      FROM rsvps
      WHERE event_slug = ${OYSTER_ROAST_SLUG}
        AND attending = true
    `,
    sql`
      SELECT
        guest_name AS "guestName",
        party_size::int AS "partySize"
      FROM rsvps
      WHERE event_slug = ${OYSTER_ROAST_SLUG}
        AND attending = true
        AND display_on_guest_list = true
      ORDER BY LOWER(guest_name), created_at
    `,
  ]);

  const total = totalRows[0] as { totalGuestCount?: number | string } | undefined;

  return {
    totalGuestCount: Number(total?.totalGuestCount ?? 0),
    guests: guestRows.map((row) => {
      const guest = row as { guestName: string; partySize: number | string };

      return {
        guestName: guest.guestName,
        partySize: Number(guest.partySize),
      };
    }),
  };
}
