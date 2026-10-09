import "server-only";
import { OYSTER_ROAST_EVENT, type EventFeatures } from "../oyster-roast-event";
import { draftEventSlug } from "../event-routes";
import type { DraftSettings } from "../event-draft-settings";
import { requireHostPrincipal } from "./host-access";
import { isAdminAuthenticated } from "./admin-session";
import { getEventDraft } from "./event-drafts";
import { getDraftSettings } from "./event-draft-settings";
import { getEventPublication, getHostEventPublication } from "./event-publications";

const brand: unique symbol = Symbol("server-resolved-event");
export type EventScope = Readonly<{
  [brand]: true;
  slug: string;
  publicSlug?: string;
  access: "public" | "host";
  features: Readonly<EventFeatures>;
  rsvp: Readonly<DraftSettings["rsvp"]>;
  rsvpsOpen: boolean;
}>;
const issuedScopes = new WeakSet<EventScope>();
const scopeOwners = new WeakMap<EventScope, string | null>();
function issue(slug: string, access: EventScope["access"], settings: DraftSettings, rsvpsOpen = true, publicAlias?: string | null): EventScope {
  const scope: EventScope = Object.freeze({
    [brand]: true as const, slug, access, rsvpsOpen, ...(publicAlias ? { publicSlug: publicAlias } : {}),
    features: Object.freeze({ ...settings.features }), rsvp: Object.freeze({ ...settings.rsvp }),
  });
  issuedScopes.add(scope);
  return scope;
}

// Backward-compatible default for every existing live route/action. It cannot
// be replaced by a client-supplied event_slug or serialized settings object.
export const OYSTER_ROAST_SCOPE = issue(OYSTER_ROAST_EVENT.slug, "public", {
  features: OYSTER_ROAST_EVENT.features,
  rsvp: { maxPartySize: 20, allowComments: true, guestListDefaultVisible: true },
});

export function assertEventScope(scope: EventScope): void {
  if (!issuedScopes.has(scope)) throw new Error("Event access is not available.");
}
export function eventScopeSlug(scope: EventScope): string {
  assertEventScope(scope);
  return scope.slug;
}

// Private data operations require a current session AND a host-only scope
// issued for that same principal. Public scopes never grant host privileges.
export async function requireHostEventScope(scope: EventScope): Promise<void> {
  assertEventScope(scope);
  if (scope === OYSTER_ROAST_SCOPE) {
    if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
    return;
  }
  const principal = await requireHostPrincipal();
  if (scope.access !== "host" || !scopeOwners.has(scope) || scopeOwners.get(scope) !== principal.ownerId) throw new Error("Event unavailable.");
}
export function eventFeatureEnabled(scope: EventScope, feature: keyof EventFeatures): boolean {
  assertEventScope(scope);
  return scope.features[feature];
}
export function requireEventFeature(scope: EventScope, feature: keyof EventFeatures): void {
  if (!eventFeatureEnabled(scope, feature)) throw new Error("This event feature is not available.");
}

// No public draft lookup, even for signed-in hosts. Only explicitly published
// settings authorize guest data access. Every action re-resolves its locator.
export async function resolvePublicEventScope(slug: string): Promise<EventScope | null> {
  if (slug === OYSTER_ROAST_EVENT.slug) return OYSTER_ROAST_SCOPE;
  const publication = await getEventPublication(slug);
  return publication ? issue(publication.slug, "public", publication.snapshot.settings, publication.rsvpsOpen, publication.publicAlias) : null;
}

export async function resolveHostEventScope(slug: string): Promise<EventScope | null> {
  const principal = await requireHostPrincipal();
  const publication = await getHostEventPublication(slug);
  if (!publication) return null;
  const scope = issue(publication.slug, "host", publication.snapshot.settings, publication.rsvpsOpen, publication.publicAlias);
  scopeOwners.set(scope, principal.ownerId);
  return scope;
}

export async function getHostDraftScope(id: string): Promise<EventScope | null> {
  const principal = await requireHostPrincipal();
  const [draft, record] = await Promise.all([getEventDraft(id), getDraftSettings(id)]);
  if (!draft || !record) return null;
  const scope = issue(draftEventSlug(draft.id), "host", record.settings);
  scopeOwners.set(scope, principal.ownerId);
  return scope;
}
