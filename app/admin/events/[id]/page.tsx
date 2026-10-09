import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../components/admin/content-shell";
import { EventDraftEditor } from "../../../../components/admin/event-draft-editor";
import { isAdminAuthenticated } from "../../../../lib/server/admin-session";
import { getEventDraft } from "../../../../lib/server/event-drafts";
import { getDraftArtwork } from "../../../../lib/server/event-draft-artwork";
import { getDraftSettings } from "../../../../lib/server/event-draft-settings";
import { isDraftId } from "../../../../lib/event-drafts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit Event Draft | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function EditEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
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
  const previewContext = await Promise.all([getDraftArtwork(id), getDraftSettings(id)])
    .then(([artwork, settings]) => artwork && settings ? { artwork: artwork.settings, settings } : null)
    .catch(() => null);
  return <EventDraftEditor key={id} id={id} initialDraft={draft} previewContext={previewContext} justSaved={(await searchParams).saved === "1"} timeZones={[...new Set([draft.timeZone, "UTC", ...Intl.supportedValuesOf("timeZone")])]} />;
}
