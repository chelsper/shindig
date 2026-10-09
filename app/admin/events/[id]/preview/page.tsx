import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventDraftFullPreview } from "../../../../../components/admin/event-draft-full-preview";
import { isDraftId } from "../../../../../lib/event-drafts";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { getDraftArtwork } from "../../../../../lib/server/event-draft-artwork";
import { getDraftSettings } from "../../../../../lib/server/event-draft-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private Event Preview | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#202523]/20 px-4 py-2 text-xs font-semibold text-[#355f9e]";

export default async function DraftPreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  const view = (await searchParams).view === "hub" ? "hub" : "invitation";
  let data;
  try { data = await Promise.all([getEventDraft(id), getDraftArtwork(id), getDraftSettings(id)]); }
  catch {
    return <ContentShell title="Preview couldn’t load" contextLabel="Private draft" description="Please try again shortly. Your saved draft and live event haven’t changed."><Link className={button} href={`/admin/events/${id}`}>Back to event setup</Link></ContentShell>;
  }
  const [draft, artwork, record] = data;
  if (!draft || !artwork || !record) notFound();
  return <EventDraftFullPreview draft={draft} artwork={artwork.settings} record={record} view={view} />;
}
