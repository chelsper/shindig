import "server-only";
import { neon } from "@neondatabase/serverless";
import { requireHostPrincipal } from "./host-access";
import { HostEventLimitError, type HostEventUsage } from "../host-event-limits";

// One server-owned policy for both creation paths. No client-provided overrides.
export function getHostEventLimit(): number {
  const raw = process.env.HOST_EVENT_LIMIT;
  if (raw === undefined) return 10;
  if (!/^[1-9]\d{0,3}$/.test(raw.trim()) || Number(raw) > 1000) {
    throw new Error("Event creation limit is not configured correctly.");
  }
  return Number(raw);
}

export async function getHostEventUsage(): Promise<HostEventUsage> {
  const principal = await requireHostPrincipal();
  const limit = getHostEventLimit();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Event storage is unavailable.");
  const rows = await neon(url)`SELECT count(*)::integer AS used FROM events
    WHERE owner_host_id IS NOT DISTINCT FROM ${principal.ownerId}::text`;
  const used = rows[0]?.used;
  if (!Number.isSafeInteger(used) || used < 0) throw new Error("Event usage is unavailable.");
  return { used, limit };
}

// Only this exact database signal is safe to translate into a limit message.
export function rethrowHostEventLimit(error: unknown, limit: number): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P0001"
    && "constraint" in error && error.constraint === "shindig_host_event_limit") {
    throw new HostEventLimitError(limit);
  }
  throw error;
}
