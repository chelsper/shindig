import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventPublishReview } from "../../../../../components/admin/event-publish-review";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { getDraftArtwork } from "../../../../../lib/server/event-draft-artwork";
import { getDraftSettings } from "../../../../../lib/server/event-draft-settings";
import { getHostEventPublication } from "../../../../../lib/server/event-publications";
import { hasUnpublishedChanges } from "../../../../../lib/event-lifecycle";
import { draftEventSlug } from "../../../../../lib/event-routes";
import { isDraftId } from "../../../../../lib/event-drafts";
import { isMusicSearchConfigured } from "../../../../../lib/server/music";
export const dynamic = "force-dynamic";
export const metadata = { title: "Review & Publish | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let data;
  try { data = await Promise.all([getEventDraft(id), getDraftArtwork(id), getDraftSettings(id), getHostEventPublication(draftEventSlug(id))]); }
  catch { return <ContentShell title="Review is temporarily unavailable" contextLabel="Event publishing" description="Your live pages have not changed. Check migrations through 017 are installed and refresh to try again."><a className="primary-button inline-flex" href={`/admin/events/${id}`}>Back to setup</a></ContentShell>; }
  const [draft, artwork, settings, publication] = data;
  if (!draft || !artwork || !settings) notFound();
  return <ContentShell title="Review, publish & share" contextLabel="Your event" description="One last look before the plans leave the kitchen. Only the version you approve here becomes public." dashboardHref="/admin/events"><EventPublishReview key={`${draft.revision}-${artwork.revision}-${settings.revision}-${publication?.revision ?? 0}`} draft={draft} artwork={artwork} settings={settings} musicConfigured={isMusicSearchConfigured()} live={publication ? { revision: publication.revision, publishedAt: publication.publishedAt, coordinates: publication.snapshot.coordinates, visibility: publication.visibility, rsvpsOpen: publication.rsvpsOpen, publicAlias: publication.publicAlias, title: publication.snapshot.details.title, hasUnpublishedChanges: hasUnpublishedChanges({ details: draft.revision, artwork: artwork.revision, settings: settings.revision }, publication.sourceRevisions) } : null} /></ContentShell>;
}
