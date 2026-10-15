import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { InvitationTrackerPanel } from "../../../../../components/admin/invitation-tracker";
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
export default async function EventInvitationsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  const slug = draftEventSlug(id), base = `/admin/events/${id}`;
  const result = await Promise.all([getEventDraft(id), getHostDraftScope(id), getHostEventPublication(slug)]).catch(() => null);
  if (!result) return <ContentShell title="Tracker unavailable" contextLabel="Your event" dashboardHref={`${base}/setup`} description="We couldn’t load the invitation tracker. Please refresh and try again.">{null}</ContentShell>;
  const [draft, scope, publication] = result;
  if (!draft || !scope) notFound();
  const data = await listInvitationTracker(scope).catch(() => null);
  const invitationUrl = publication?.visibility === "published" ? new URL(eventPaths(publication.publicAlias ?? slug).invitation, SHINDIG_SITE.url).toString() : null;
  return <ContentShell title="Invitation tracker" contextLabel={draft.title} dashboardHref={`${base}/setup`} description="Plan your invitations privately, before or after publishing. RSVPs stay separate until you confirm a match.">
    {publication && <nav className="mb-5 flex flex-wrap gap-4 text-sm text-[#355f9e]" aria-label="Guest management"><Link className="inline-flex min-h-11 items-center underline" href={`${base}/guests`}>Guest responses →</Link><Link className="inline-flex min-h-11 items-center underline" href={`${base}/guests?view=contacts`}>Private contacts →</Link></nav>}
    {data ? <InvitationTrackerPanel initial={data} title={publication?.snapshot.details.title ?? draft.title} invitationUrl={invitationUrl} eventSlug={slug} /> : <p role="alert">The invitation tracker couldn’t load. Please refresh and try again.</p>}
  </ContentShell>;
}
