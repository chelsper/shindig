import "server-only";
import { requireHostPrincipal } from "./host-access";
import { neon } from "@neondatabase/serverless";
import { getEventDraft } from "./event-drafts";
import { isDraftId, isDraftRevision } from "../event-drafts";
import { parseEventLocation, type ConfirmedEventLocation } from "../event-location";
import { LocationError, LocationConflictError, searchAddress } from "./address-search";

async function currentDraft(id: string, revision: number) {
  // getEventDraft protects the data layer (and ownership when configured).
  const draft = await getEventDraft(id);
  if (!isDraftId(id) || !isDraftRevision(revision) || !draft || draft.revision !== revision) throw new LocationConflictError("This draft has changed. Reload the location page before continuing.");
  if (!draft.address.trim()) throw new LocationError("Add and save the event address in Details first.");
  return draft;
}

export async function findDraftAddress(id: string, revision: number) {
  const draft = await currentDraft(id, revision);
  return searchAddress(draft.address);
}

export async function confirmDraftLocation(id: string, revision: number, input: unknown, confirmed: unknown) {
  const principal = await requireHostPrincipal();
  const draft = await currentDraft(id, revision);
  if (confirmed !== true || !input || typeof input !== "object") throw new LocationError("Please check and confirm the event location before saving.");
  const row = input as Record<string, unknown>;
  let location: ConfirmedEventLocation | null = null;
  if (row.source === "manual") {
    location = parseEventLocation({ address: draft.address, matchedAddress: draft.address, latitude: row.latitude, longitude: row.longitude, source: "manual" }, draft.address);
  } else if (row.source === "census") {
    // Never trust a browser-supplied provider label or coordinates.
    const matches = await searchAddress(draft.address);
    const match = matches.find((match) => match.matchedAddress === row.matchedAddress && match.latitude === row.latitude && match.longitude === row.longitude);
    if (match) location = parseEventLocation({ ...match, address: draft.address, source: "census" }, draft.address);
  }
  if (!location) throw new LocationError("Choose a current address match or enter valid latitude and longitude.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new LocationError("Location storage is unavailable. Your live event has not changed.");
  const sql = neon(url);
  const rows = await sql`UPDATE events SET location_confirmation = ${JSON.stringify(location)}::jsonb,
    revision = revision + 1, updated_at = now()
    WHERE id = ${id}::uuid AND status = 'draft' AND revision = ${revision} AND address = ${draft.address}
      AND owner_host_id IS NOT DISTINCT FROM ${principal.ownerId}::text
    RETURNING revision`;
  if (!rows.length) throw new LocationConflictError("This draft changed while you were confirming. Reload the location page and try again.");
  return { revision: rows[0].revision as number, location };
}
