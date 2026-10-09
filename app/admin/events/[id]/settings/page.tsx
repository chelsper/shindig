import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventDraftSettingsEditor } from "../../../../../components/admin/event-draft-settings-editor";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { getDraftArtwork } from "../../../../../lib/server/event-draft-artwork";
import { getDraftSettings } from "../../../../../lib/server/event-draft-settings";
import { isDraftId } from "../../../../../lib/event-drafts";
import { getHostEventPublication } from "../../../../../lib/server/event-publications";
import { draftEventSlug } from "../../../../../lib/event-routes";
import { savedWeatherCoordinates } from "../../../../../lib/event-readiness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Draft RSVP & Hub Settings | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function DraftSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let data;
  try { data = await Promise.all([getEventDraft(id), getDraftArtwork(id), getDraftSettings(id), getHostEventPublication(draftEventSlug(id))]); }
  catch {
    return <ContentShell title="Settings couldn’t load" contextLabel="Private draft" dashboardHref="/admin/events" description="Please try again shortly. For first-time setup, check migrations 001–019 and 021 are installed. Your live event hasn’t changed."><Link className="inline-flex min-h-11 items-center text-sm text-[#355f9e] underline" href={`/admin/events/${id}/setup`}>Back to overview</Link></ContentShell>;
  }
  const [draft, artwork, initial] = data;
  if (!draft || !artwork || !initial) notFound();
  return <EventDraftSettingsEditor draft={draft} artwork={artwork.settings} initial={initial} coordinates={savedWeatherCoordinates(draft)} />;
}
