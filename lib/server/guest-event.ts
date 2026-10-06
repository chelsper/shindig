import "server-only";
import { OYSTER_ROAST_SCOPE, resolvePublicEventScope, type EventScope } from "./event-scope";
import { eventPaths } from "../event-routes";
import { OYSTER_ROAST_EVENT, type EventFeatures } from "../oyster-roast-event";
export function guestFeatureEnabled(scope: EventScope | null, feature: keyof EventFeatures) {
  return scope === OYSTER_ROAST_SCOPE ? OYSTER_ROAST_EVENT.features[feature] : scope?.features[feature] === true;
}
export async function guestEventScope(slug?: string) {
  if (slug === undefined) return OYSTER_ROAST_SCOPE;
  if (typeof slug !== "string") return null;
  try { return await resolvePublicEventScope(slug); } catch { return null; }
}
export function guestScopeArgs(slug: string | undefined, scope: EventScope): [] | [EventScope] {
  return slug === undefined ? [] : [scope];
}
export function guestHubPath(scope: EventScope) {
  return scope.slug === OYSTER_ROAST_SCOPE.slug ? "/event" : eventPaths(scope.slug).hub;
}
