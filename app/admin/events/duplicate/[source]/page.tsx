import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { EventDuplicateForm } from "../../../../../components/admin/event-duplicate-form";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { getDuplicationSource } from "../../../../../lib/server/event-duplication";
import { isDuplicationSource } from "../../../../../lib/event-duplication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export const metadata = { title: "Duplicate Event | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function DuplicateEventPage({ params }: { params: Promise<{ source: string }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { source } = await params;
  if (!isDuplicationSource(source)) notFound();
  let data;
  try { data = await getDuplicationSource(source); }
  catch { return <ContentShell title="This setup couldn’t load" contextLabel="Duplicate event" dashboardHref="/admin/events" description="We couldn’t read the saved source event. Please try again shortly. No copy has been created and your original event is unchanged.">{null}</ContentShell>; }
  if (!data) notFound();
  return <EventDuplicateForm source={data.key} sourceTitle={data.details.title} fingerprint={data.fingerprint} requestId={randomUUID()} settingsSaved={data.settingsSaved} hasArtwork={Boolean(data.images.invitation || data.images.header)} />;
}
