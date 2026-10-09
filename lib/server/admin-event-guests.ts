import "server-only";
import { isHostAuthenticated } from "./host-access";
import { getHostEventPublication } from "./event-publications";
import { resolveHostEventScope } from "./event-scope";
import { publicationEvent } from "../event-publication";
import { isDraftId } from "../event-drafts";
import { draftEventSlug } from "../event-routes";

// Authenticate before resolving any event; a missing/forged locator never falls
// back to the legacy event. These controls use published rules, not draft edits.
export async function getAdminGuestEvent(id: string) {
  if (!(await isHostAuthenticated())) throw new Error("Host access required.");
  if (!isDraftId(id)) return null;
  const slug = draftEventSlug(id);
  const [publication, scope] = await Promise.all([getHostEventPublication(slug), resolveHostEventScope(slug)]);
  return publication && scope ? { event: publicationEvent(id, publication.snapshot, publication.rsvpsOpen, publication.publicAlias), scope, publication } : null;
}
