import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { EventLocationEditor } from "../../../../../components/admin/event-location-editor";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { getEventDraft } from "../../../../../lib/server/event-drafts";
import { isDraftId } from "../../../../../lib/event-drafts";
export const dynamic = "force-dynamic";
export const metadata = { title: "Event location | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  let draft;
  try { draft = await getEventDraft(id); }
  catch { return <ContentShell title="Location is temporarily unavailable" contextLabel="Event setup" description="Your live event has not changed. Check migration 021 is installed, then try again." dashboardHref="/admin/events"><Link className="primary-button inline-flex" href={`/admin/events/${id}/setup`}>Back to setup</Link></ContentShell>; }
  if (!draft) notFound();
  return <ContentShell title="Set the scene" contextLabel="Event location" description="Confirm the place once, so Weather is ready when you publish." dashboardHref="/admin/events"><EventLocationEditor key={draft.revision} draft={draft} /></ContentShell>;
}
