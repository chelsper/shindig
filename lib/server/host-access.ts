import "server-only";
import { neon } from "@neondatabase/serverless";
import { isAdminAuthenticated } from "./admin-session";
import { isDraftId } from "../event-drafts";
import { getHostAccountSession } from "./host-auth";

// Null ownership is a deliberately separate legacy workspace, not an unclaimed
// event. No signup, email match, or client input may claim those records.
export type HostPrincipal = { ownerId: string | null; name: string; email: string | null };

export async function getHostPrincipal(): Promise<HostPrincipal | null> {
  if (await isAdminAuthenticated()) return { ownerId: null, name: "Shindig", email: null };
  const user = await getHostAccountSession();
  return user ? { ownerId: user.id, name: user.name, email: user.email } : null;
}

export async function requireHostPrincipal(): Promise<HostPrincipal> {
  const principal = await getHostPrincipal();
  if (!principal) throw new Error("Host access required.");
  return principal;
}

export async function isHostAuthenticated() {
  return Boolean(await getHostPrincipal());
}

export async function ownsEvent(id: string): Promise<boolean> {
  const principal = await requireHostPrincipal();
  if (!isDraftId(id)) return false;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  const rows = await neon(url)`SELECT id FROM events WHERE id = ${id}::uuid
    AND owner_host_id IS NOT DISTINCT FROM ${principal.ownerId}::text LIMIT 1`;
  return rows.length === 1;
}

export async function requireOwnedEvent(id: string): Promise<void> {
  if (!(await ownsEvent(id))) throw new Error("Event unavailable.");
}

export async function requireOwnedCopyReservation(id: string, source: string): Promise<void> {
  const principal = await requireHostPrincipal();
  if (!isDraftId(id)) throw new Error("Copy unavailable.");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  const rows = await neon(url)`SELECT id FROM event_duplication_requests
    WHERE id = ${id}::uuid AND source_key = ${source}
      AND owner_host_id IS NOT DISTINCT FROM ${principal.ownerId}::text LIMIT 1`;
  if (!rows.length) throw new Error("Copy unavailable.");
}
