import "server-only";
import { isAdminAuthenticated } from "./admin-session";
import { resolvePublicEventScope, type EventScope } from "./event-scope";
import { revalidatePath } from "next/cache";
import { eventPaths } from "../event-routes";
export async function hostScopeArgs(slug?: string): Promise<[] | [EventScope]> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  if (slug === undefined) return [];
  const scope = typeof slug === "string" ? await resolvePublicEventScope(slug) : null;
  if (!scope) throw new Error("Event unavailable.");
  return [scope];
}
export function refreshHostEvent(slug?: string) {
  if (!slug || !slug.startsWith("event-")) return;
  revalidatePath(eventPaths(slug).hub);
  revalidatePath(`/admin/events/${slug.slice(6)}`, "layout");
}
