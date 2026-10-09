import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventDraftArtworkEditor } from "../../../../../components/admin/event-draft-artwork-editor";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { draftImageStorageToken, getDraftArtwork } from "../../../../../lib/server/event-draft-artwork";
import { isDraftId } from "../../../../../lib/event-drafts";
import { parseEventDesignId } from "../../../../../lib/event-design";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Draft Artwork | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function DraftArtworkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ style?: string | string[] }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let data;
  try { data = await Promise.all([getEventDraft(id), getDraftArtwork(id)]); }
  catch {
    return <ContentShell title="Artwork couldn’t load" contextLabel="Private draft" description="Please try again shortly. For first-time setup, apply migration 011 after migration 010. Your live event hasn’t changed."><Link className="inline-flex min-h-11 items-center text-sm text-[#355f9e] underline" href={`/admin/events/${id}`}>Back to event basics</Link></ContentShell>;
  }
  const [draft, initial] = data;
  if (!draft || !initial) notFound();
  return <EventDraftArtworkEditor draft={draft} initial={initial} uploadConfigured={Boolean(draftImageStorageToken())} requestedDesign={parseEventDesignId((await searchParams)?.style) ?? undefined} />;
}
