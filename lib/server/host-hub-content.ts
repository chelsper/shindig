import "server-only";
import { isDraftId } from "../event-drafts";
import { draftEventSlug } from "../event-routes";
import { requireHostPrincipal } from "./host-access";
import { getEventDraft } from "./event-drafts";
import { getDraftSettings } from "./event-draft-settings";
import { getHostEventPublication } from "./event-publications";
import { hostScopeArgs } from "./host-event";

export async function getHostHubContentEvent(id: string) {
  await requireHostPrincipal();
  if (!isDraftId(id)) return null;
  const draft = await getEventDraft(id);
  if (!draft) return null;
  const slug = draftEventSlug(id);
  const [settings, publication, scopes] = await Promise.all([
    getDraftSettings(id), getHostEventPublication(slug), hostScopeArgs(slug),
  ]);
  if (!settings || !scopes[0]) return null;
  return { draft, settings, publication, scope: scopes[0], slug };
}
