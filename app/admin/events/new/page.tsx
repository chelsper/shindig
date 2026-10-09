import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { EventDraftEditor } from "../../../../components/admin/event-draft-editor";
import { parseEventDesignId } from "../../../../lib/event-design";
import { isAdminAuthenticated } from "../../../../lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create Event Draft | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function NewEventPage({ searchParams }: { searchParams?: Promise<{ style?: string | string[] }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  return <EventDraftEditor id={randomUUID()} timeZones={["UTC", ...Intl.supportedValuesOf("timeZone")]} requestedDesign={parseEventDesignId((await searchParams)?.style) ?? undefined} />;
}
