import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../components/admin/content-shell";
import { EventDraftEditor } from "../../../../components/admin/event-draft-editor";
import { isHostAuthenticated } from "../../../../lib/server/host-access";
import { getEventDraft } from "../../../../lib/server/event-drafts";
import { getDraftArtwork } from "../../../../lib/server/event-draft-artwork";
import { getDraftSettings } from "../../../../lib/server/event-draft-settings";
import { isDraftId } from "../../../../lib/event-drafts";
import { getDraftPublicationStatus } from "../../../../lib/server/event-save-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit Event Draft | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function EditEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let draft;
  try { draft = await getEventDraft(id); }
  catch {
    return <ContentShell title="Your draft couldn’t load" contextLabel="Event planning" description="Please try again shortly. Your live event has not been changed."><Link href="/admin/events" className="inline-flex min-h-11 items-center text-sm text-[#355f9e] underline">Back to your events</Link></ContentShell>;
  }
  if (!draft) notFound();
  // Keep details editable if optional preview reads fail. Never substitute live
  // artwork or invent defaults for an existing draft whose settings did not load.
  const previewData = await Promise.all([getDraftArtwork(id), getDraftSettings(id)]).catch(() => null);
  const previewContext = previewData?.[0] && previewData[1] ? { artwork: previewData[0].settings, settings: previewData[1] } : null;
  const publicationStatus = previewData?.[0] && previewData[1] ? await getDraftPublicationStatus(id, { details: draft.revision, artwork: previewData[0].revision, settings: previewData[1].revision }) : null;
  return <EventDraftEditor key={id} id={id} initialDraft={draft} publicationStatus={publicationStatus} previewContext={previewContext} justSaved={(await searchParams).saved === "1"} timeZones={[...new Set([draft.timeZone, "UTC", ...Intl.supportedValuesOf("timeZone")])]} />;
}
