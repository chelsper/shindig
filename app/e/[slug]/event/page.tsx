import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolvePublicEventScope } from "../../../../lib/server/event-scope";
import { getPublishedEvent } from "../../../../lib/server/event-publications";
import { PublishedEventHub } from "../../../../components/event-hub/published-event-hub";
import { EventDetailsUnavailable } from "../../../../components/event-details-unavailable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event Hub | Shindig", robots: { index: false, follow: false } };

export default async function ScopedEventHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "oyster-roast-2026") redirect("/event");
  let data;
  try { data = await Promise.all([getPublishedEvent(slug), resolvePublicEventScope(slug)]); }
  catch { return <EventDetailsUnavailable />; }
  const [event, scope] = data;
  if (!event || !scope) notFound();
  return <PublishedEventHub event={event} scope={scope} />;
}
