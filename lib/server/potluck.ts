import "server-only";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { isValidRsvpEditToken } from "../rsvp-edit-token";
import { isPublicKey } from "../guest-interactions";
import { validatePotluckClaim, validatePotluckItem, type HostPotluckItem, type PotluckClaim, type PotluckClaimInput, type PublicPotluckItem } from "../potluck";
import { hostScopeArgs } from "./host-event";
import { eventFeatureEnabled, eventScopeSlug, OYSTER_ROAST_SCOPE, requireEventFeature, type EventScope } from "./event-scope";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Bring-something storage is unavailable.");
  return neon(url);
}
export function potluckTokenHash(token: string) {
  if (!isValidRsvpEditToken(token)) throw new Error("Invalid signup link.");
  return createHash("sha256").update(`shindig:potluck:${token}`).digest("hex");
}
export function potluckRequesterHash(headers: Pick<Headers, "get">) {
  // Only Vercel's trusted header is used in production; local requests share a
  // bucket. No IP address is stored or returned to the host/public list.
  const ip = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
  return createHash("sha256").update(`potluck:${new Date().toISOString().slice(0, 10)}:${ip}`).digest("hex");
}
type Row = Record<string, unknown>;
function publicItem(row: Row): PublicPotluckItem {
  return { key: String(row.key), title: String(row.title), note: String(row.note), needed: Number(row.needed), claimed: Number(row.claimed) };
}
function privateClaim(row: Row): PotluckClaim {
  return { itemKey: String(row.itemKey), title: String(row.title), guestName: String(row.guestName), quantity: Number(row.quantity), revision: Number(row.revision), archived: Boolean(row.archived) };
}
export async function listPublicPotluckItems(scope: EventScope): Promise<PublicPotluckItem[]> {
  const slug = eventScopeSlug(scope);
  if (!eventFeatureEnabled(scope, "potluck")) return [];
  const sql = database();
  const rows = await sql`SELECT i.public_key AS key, i.title, i.note, i.needed,
      coalesce((SELECT sum(c.quantity) FROM potluck_claims c WHERE c.item_id=i.id),0)::integer AS claimed
    FROM potluck_items i JOIN event_publications p ON p.slug=i.event_slug
    WHERE i.event_slug=${slug} AND NOT i.archived AND p.visibility='published' AND p.snapshot #>> '{settings,features,potluck}'='true'
    ORDER BY i.created_at, i.id LIMIT 50`;
  return rows.map(publicItem);
}
export async function getPotluckClaim(token: string, scope: EventScope): Promise<PotluckClaim | null> {
  const slug = eventScopeSlug(scope);
  if (!isValidRsvpEditToken(token) || !eventFeatureEnabled(scope, "potluck")) return null;
  const sql = database();
  const rows = await sql`SELECT i.public_key AS "itemKey", i.title, i.archived,
      c.guest_name AS "guestName", c.quantity, c.revision
    FROM potluck_claims c JOIN potluck_items i ON i.id=c.item_id JOIN event_publications p ON p.slug=c.event_slug
    WHERE c.event_slug=${slug} AND c.edit_token_hash=${potluckTokenHash(token)}
      AND p.visibility='published' AND p.snapshot #>> '{settings,features,potluck}'='true'`;
  return rows[0] ? privateClaim(rows[0]) : null;
}
export async function writePotluckClaim(operation: "create" | "update" | "cancel", input: PotluckClaimInput, requester: string, scope: EventScope): Promise<{ status: string; claim?: PotluckClaim }> {
  requireEventFeature(scope, "potluck");
  const parsed = validatePotluckClaim(input, operation === "cancel");
  if (!parsed.ok || !["create", "update", "cancel"].includes(operation)) throw new Error("Invalid signup.");
  const slug = eventScopeSlug(scope), sql = database(), data = parsed.data;
  const rows = await sql`SELECT shindig_claim_potluck(${slug},${operation},${data.itemKey}::uuid,${potluckTokenHash(data.editToken)},${requester},${data.guestName},${data.quantity},${data.revision}) AS result`;
  const result = rows[0]?.result;
  return { status: String(result?.status ?? "unavailable"), ...(result?.status === "saved" && result.claim ? { claim: privateClaim(result.claim) } : {}) };
}
async function hostSlug(slug: string) {
  const args = await hostScopeArgs(slug);
  return eventScopeSlug(args[0] ?? OYSTER_ROAST_SCOPE);
}
export async function listHostPotluckItems(slug: string): Promise<HostPotluckItem[]> {
  const event = await hostSlug(slug), sql = database();
  const rows = await sql`SELECT i.public_key AS key,i.title,i.note,i.needed,i.revision,i.archived,
    coalesce((SELECT sum(c.quantity) FROM potluck_claims c WHERE c.item_id=i.id),0)::integer AS claimed,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'guestName',c.guest_name,'quantity',c.quantity) ORDER BY c.created_at,c.id)
      FROM potluck_claims c WHERE c.item_id=i.id AND c.quantity>0),'[]'::jsonb) AS claims
    FROM potluck_items i WHERE i.event_slug=${event} ORDER BY i.archived,i.created_at,i.id LIMIT 50`;
  return rows.map(row => ({ ...publicItem(row), revision: Number(row.revision), archived: Boolean(row.archived), claims: (Array.isArray(row.claims) ? row.claims : []).map(c => ({ id: String(c.id), guestName: String(c.guestName), quantity: Number(c.quantity) })) }));
}
export async function saveHostPotluckItem(slug: string, input: unknown): Promise<string> {
  const event = await hostSlug(slug), parsed = validatePotluckItem(input);
  if (!parsed.ok) throw new Error("Invalid item.");
  const sql = database(), d = parsed.data;
  const rows = await sql`SELECT shindig_save_potluck_item(${event},${d.key}::uuid,${d.title},${d.note},${d.needed},${d.archived},${d.revision}) AS status`;
  return String(rows[0]?.status ?? "unavailable");
}
export async function releaseHostPotluckClaim(slug: string, id: string): Promise<boolean> {
  const event = await hostSlug(slug);
  if (!isPublicKey(id)) throw new Error("Invalid signup.");
  const sql = database(), rows = await sql`SELECT shindig_release_potluck_claim(${event},${id}::uuid) AS saved`;
  return rows[0]?.saved === true;
}
