import "server-only";
import { isHostAuthenticated } from "./host-access";
import { resolveHostEventScope, requireHostEventScope, OYSTER_ROAST_SCOPE, type EventScope } from "./event-scope";
import { revalidatePath } from "next/cache";
import { eventPaths } from "../event-routes";
import { getHostEventPublication } from "./event-publications";
export async function hostScopeArgs(slug?: string): Promise<[] | [EventScope]> {
  if (!(await isHostAuthenticated())) throw new Error("Host access required.");
  if (slug === undefined) { await requireHostEventScope(OYSTER_ROAST_SCOPE); return []; }
  const scope = slug === OYSTER_ROAST_SCOPE.slug ? OYSTER_ROAST_SCOPE : typeof slug === "string" ? await resolveHostEventScope(slug) : null;
  if (!scope) throw new Error("Event unavailable.");
  await requireHostEventScope(scope);
  return [scope];
}
export async function refreshHostEvent(slug?: string) {
  if (!slug || !slug.startsWith("event-")) return;
  revalidatePath(eventPaths(slug).hub);
  const publication = await getHostEventPublication(slug);
  if (publication?.publicAlias) revalidatePath(eventPaths(publication.publicAlias).hub);
  revalidatePath(`/admin/events/${slug.slice(6)}`, "layout");
}
