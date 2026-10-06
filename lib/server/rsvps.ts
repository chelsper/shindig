import "server-only";

import { neon } from "@neondatabase/serverless";

import { OYSTER_ROAST_SCOPE, eventScopeSlug, eventFeatureEnabled, type EventScope } from "./event-scope";
import type {
  ValidatedRsvp,
  ValidatedRsvpUpdate,
} from "./rsvp-validation";
import { validateRsvpUpdate } from "./rsvp-validation";

function fieldsForEvent(input: ValidatedRsvpUpdate, scope: EventScope): ValidatedRsvpUpdate {
  const result = validateRsvpUpdate(input, { ...scope.rsvp, guestListEnabled: scope.features.guestList });
  if (!result.success) throw new Error("Invalid RSVP for this event.");
  return result.data;
}

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

export async function saveRsvp(rsvp: ValidatedRsvp,
  editTokenHash: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<SaveRsvpResult> {
  const eventSlug = eventScopeSlug(scope);
  if (rsvp.eventSlug !== eventSlug) throw new Error("Invalid RSVP event.");
  rsvp = { ...rsvp, ...fieldsForEvent(rsvp, scope) };
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
      ${eventSlug},
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
      AND event_slug = ${eventSlug}
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

export async function getRsvpForGuest(editTokenHash: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<GuestRsvp | null> {
  const eventSlug = eventScopeSlug(scope);
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    SELECT
      guest_name AS "guestName",
      attending,
      party_size AS "partySize",
      display_on_guest_list AS "displayOnGuestList",
      comment
    FROM rsvps
    WHERE event_slug = ${eventSlug}
      AND edit_token_hash = ${editTokenHash}
    LIMIT 1
  `;

  return (rows[0] as GuestRsvp | undefined) ?? null;
}

export async function updateRsvpForGuest(editTokenHash: string,
  rsvp: ValidatedRsvpUpdate, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<GuestRsvp | null> {
  const eventSlug = eventScopeSlug(scope);
  rsvp = fieldsForEvent(rsvp, scope);
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
    WHERE event_slug = ${eventSlug}
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

export async function getRsvpSummary(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<RsvpSummary> {
  const eventSlug = eventScopeSlug(scope);
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE attending)::int AS "totalAttending",
      COUNT(*)::int AS "totalResponses",
      COUNT(*) FILTER (WHERE NOT attending)::int AS declined,
      COALESCE(SUM(party_size) FILTER (WHERE attending), 0)::int AS "totalPartySize"
    FROM rsvps
    WHERE event_slug = ${eventSlug}
  `;
  const summary = rows[0] as Partial<RsvpSummary> | undefined;

  return {
    totalAttending: Number(summary?.totalAttending ?? 0),
    totalResponses: Number(summary?.totalResponses ?? 0),
    declined: Number(summary?.declined ?? 0),
    totalPartySize: Number(summary?.totalPartySize ?? 0),
  };
}

export async function listRsvps(filter: RsvpFilter = "all", scope: EventScope = OYSTER_ROAST_SCOPE): Promise<AdminRsvp[]> {
  const eventSlug = eventScopeSlug(scope);
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
    WHERE event_slug = ${eventSlug}
      AND (${attendanceFilter}::boolean IS NULL OR attending = ${attendanceFilter})
    ORDER BY created_at DESC
  `;

  return rows.map((row) => normalizeAdminRsvp(row as DatabaseAdminRsvp));
}

export async function getRsvpForAdmin(id: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<AdminRsvp | null> {
  const eventSlug = eventScopeSlug(scope);
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
    WHERE event_slug = ${eventSlug}
      AND id = ${id}::uuid
    LIMIT 1
  `;
  const rsvp = rows[0] as DatabaseAdminRsvp | undefined;

  return rsvp ? normalizeAdminRsvp(rsvp) : null;
}

export async function createRsvpForAdmin(id: string,
  rsvp: ValidatedRsvpUpdate, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<void> {
  const eventSlug = eventScopeSlug(scope);
  rsvp = fieldsForEvent(rsvp, scope);
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
      ${eventSlug},
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

export async function updateRsvpForAdmin(id: string,
  rsvp: ValidatedRsvpUpdate, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<boolean> {
  const eventSlug = eventScopeSlug(scope);
  rsvp = fieldsForEvent(rsvp, scope);
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
    WHERE event_slug = ${eventSlug}
      AND id = ${id}::uuid
    RETURNING id
  `;

  return Boolean(rows[0]);
}

export async function deleteRsvpForAdmin(id: string, scope: EventScope = OYSTER_ROAST_SCOPE): Promise<boolean> {
  const eventSlug = eventScopeSlug(scope);
  const sql = neon(getDatabaseUrl());
  const rows = await sql`
    DELETE FROM rsvps
    WHERE event_slug = ${eventSlug}
      AND id = ${id}::uuid
    RETURNING id
  `;

  return Boolean(rows[0]);
}

export async function getPublicGuestList(scope: EventScope = OYSTER_ROAST_SCOPE): Promise<PublicGuestList> {
  const eventSlug = eventScopeSlug(scope);
  if (!eventFeatureEnabled(scope, "guestList")) return { totalGuestCount: 0, guests: [] };
  const sql = neon(getDatabaseUrl());
  const [totalRows, guestRows] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(party_size), 0)::int AS "totalGuestCount"
      FROM rsvps
      WHERE event_slug = ${eventSlug}
        AND attending = true
    `,
    sql`
      SELECT
        guest_name AS "guestName",
        party_size::int AS "partySize"
      FROM rsvps
      WHERE event_slug = ${eventSlug}
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
