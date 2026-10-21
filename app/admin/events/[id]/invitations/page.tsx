import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { InvitationTrackerPanel } from "../../../../../components/admin/invitation-tracker";
import { EventSetupNavigation } from "../../../../../components/admin/event-setup-navigation";
import { EventGuestsNavigation } from "../../../../../components/admin/event-guests-navigation";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { getHostDraftScope } from "../../../../../lib/server/event-scope";
import { getHostEventPublication } from "../../../../../lib/server/event-publications";
import { listInvitationTracker } from "../../../../../lib/server/invitation-tracker";
import { isDraftId } from "../../../../../lib/event-drafts";
import { draftEventSlug, eventPaths } from "../../../../../lib/event-routes";
import { SHINDIG_SITE } from "../../../../../lib/site";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation tracker | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function EventInvitationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ response?: string }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  const slug = draftEventSlug(id), base = `/admin/events/${id}`;
  const result = await Promise.all([getEventDraft(id), getHostDraftScope(id), getHostEventPublication(slug)]).catch(() => null);
  if (!result) return <ContentShell title="Tracker unavailable" contextLabel="Your event" dashboardHref={`${base}/setup`} description="We couldn’t load the invitation tracker. Please refresh and try again.">{null}</ContentShell>;
  const [draft, scope, publication] = result;
  if (!draft || !scope) notFound();
  const data = await listInvitationTracker(scope).catch(() => null);
  const requested = (await searchParams)?.response;
  const initialResponseId = data?.responses.find(r => r.id === requested)?.id;
  const invitationUrl = publication?.visibility === "published" ? new URL(eventPaths(publication.publicAlias ?? slug).invitation, SHINDIG_SITE.url).toString() : null;
  return <ContentShell title="Invitation tracker" contextLabel={draft.title} dashboardHref={`${base}/setup`} description="Plan your invitations privately, before or after publishing. RSVPs stay separate until you confirm a match.">
    {data ? <InvitationTrackerPanel initial={data} initialResponseId={initialResponseId} title={publication?.snapshot.details.title ?? draft.title} invitationUrl={invitationUrl} eventSlug={slug} workspace={{ id, publishedBefore: Boolean(publication) }} /> : <><EventSetupNavigation id={id} current="guests" /><EventGuestsNavigation id={id} current="invitations" publishedBefore={Boolean(publication)} /><p role="alert">The invitation tracker couldn’t load. Please refresh and try again.</p></>}
  </ContentShell>;
}
