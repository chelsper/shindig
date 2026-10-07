import "server-only";
import { OYSTER_ROAST_EVENT, type EventFeatures } from "../oyster-roast-event";
import { draftEventSlug } from "../event-routes";
import type { DraftSettings } from "../event-draft-settings";
import { isAdminAuthenticated } from "./admin-session";
import { getEventDraft } from "./event-drafts";
import { getDraftSettings } from "./event-draft-settings";
import { getEventPublication, getHostEventPublication } from "./event-publications";

const brand: unique symbol = Symbol("server-resolved-event");
export type EventScope = Readonly<{
  [brand]: true;
  slug: string;
  access: "public" | "host";
  features: Readonly<EventFeatures>;
  rsvp: Readonly<DraftSettings["rsvp"]>;
  rsvpsOpen: boolean;
}>;
const issuedScopes = new WeakSet<EventScope>();
function issue(slug: string, access: EventScope["access"], settings: DraftSettings, rsvpsOpen = true): EventScope {
  const scope: EventScope = Object.freeze({
    [brand]: true as const, slug, access, rsvpsOpen,
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
  return publication ? issue(publication.slug, "public", publication.snapshot.settings, publication.rsvpsOpen) : null;
}

export async function resolveHostEventScope(slug: string): Promise<EventScope | null> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const publication = await getHostEventPublication(slug);
  return publication ? issue(publication.slug, "host", publication.snapshot.settings, publication.rsvpsOpen) : null;
}

export async function getHostDraftScope(id: string): Promise<EventScope | null> {
  if (!(await isAdminAuthenticated())) throw new Error("Host access required.");
  const [draft, record] = await Promise.all([getEventDraft(id), getDraftSettings(id)]);
  if (!draft || !record) return null;
  return issue(draftEventSlug(draft.id), "host", record.settings);
}
