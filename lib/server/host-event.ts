import "server-only";
import { isHostAuthenticated } from "./host-access";
import { getHostDraftScope, resolveHostEventScope, requireHostEventScope, OYSTER_ROAST_SCOPE, type EventScope } from "./event-scope";
import { isDraftId } from "../event-drafts";
import { revalidatePath } from "next/cache";
import { eventPaths } from "../event-routes";
import { getHostEventPublication } from "./event-publications";
export async function hostScopeArgs(slug?: string): Promise<[] | [EventScope]> {
  if (!(await isHostAuthenticated())) throw new Error("Host access required.");
  if (slug === undefined) { await requireHostEventScope(OYSTER_ROAST_SCOPE); return []; }
  // Content can be prepared before the first publication. This fallback is
  // host-only and ownership-checked; public and RSVP resolvers are unchanged.
  let scope = slug === OYSTER_ROAST_SCOPE.slug ? OYSTER_ROAST_SCOPE : typeof slug === "string" ? await resolveHostEventScope(slug) : null;
  if (!scope && typeof slug === "string" && slug.startsWith("event-") && slug === slug.toLowerCase() && isDraftId(slug.slice(6))) scope = await getHostDraftScope(slug.slice(6));
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
