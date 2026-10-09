import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventSetupOverview } from "../../../../../components/admin/event-setup-overview";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { getDraftArtwork } from "../../../../../lib/server/event-draft-artwork";
import { getDraftSettings } from "../../../../../lib/server/event-draft-settings";
import { getHostEventPublication } from "../../../../../lib/server/event-publications";
import { isDraftId } from "../../../../../lib/event-drafts";
import { draftEventSlug } from "../../../../../lib/event-routes";
import { hasUnpublishedChanges } from "../../../../../lib/event-lifecycle";
import { savedWeatherCoordinates } from "../../../../../lib/event-readiness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event Setup | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function EventSetupPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams?: Promise<{ saved?: string | string[]; copied?: string | string[] }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let data;
  try { data = await Promise.all([getEventDraft(id), getDraftArtwork(id), getDraftSettings(id), getHostEventPublication(draftEventSlug(id))]); }
  catch {
    return <ContentShell title="Setup is temporarily unavailable" contextLabel="Your event" dashboardHref="/admin/events" description="We couldn’t check your saved details and publication status. Your draft and live pages have not changed."><a className="primary-button inline-flex" href={`/admin/events/${id}/setup`}>Try again</a></ContentShell>;
  }
  const [draft, artwork, settings, publication] = data;
  if (!draft || !artwork || !settings) notFound();
  const live = publication ? { visibility: publication.visibility, rsvpsOpen: publication.rsvpsOpen, hasUnpublishedChanges: hasUnpublishedChanges({ details: draft.revision, artwork: artwork.revision, settings: settings.revision }, publication.sourceRevisions) } : null;
  const query = await searchParams;
  return <ContentShell title="Bring your gathering together" contextLabel="Event setup" dashboardHref="/admin/events" description="A little guidance, from the first idea to the invitation. Pick up wherever you left off.">
    <EventSetupOverview draft={draft} artwork={artwork} settings={settings} coordinates={savedWeatherCoordinates(draft)} live={live} justSaved={query?.saved === "1"} justCopied={query?.copied === "1" && !publication} />
  </ContentShell>;
}
