import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { EventDraftEditor } from "../../../../components/admin/event-draft-editor";
import { parseEventDesignId } from "../../../../lib/event-design";
import { isHostAuthenticated } from "../../../../lib/server/host-access";
import { getHostEventUsage } from "../../../../lib/server/host-event-limits";
import { EventCreationUnavailable } from "../../../../components/admin/host-event-usage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create Event Draft | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function NewEventPage({ searchParams }: { searchParams?: Promise<{ style?: string | string[] }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const usage = await getHostEventUsage().catch(() => null);
  if (!usage || usage.used >= usage.limit) return <EventCreationUnavailable usage={usage} />;
  return <EventDraftEditor id={randomUUID()} timeZones={["UTC", ...Intl.supportedValuesOf("timeZone")]} requestedDesign={parseEventDesignId((await searchParams)?.style) ?? undefined} />;
}
