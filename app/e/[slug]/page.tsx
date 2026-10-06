import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPublishedEvent } from "../../../lib/server/event-publications";
import { InvitationPage } from "../../../components/invitation-page";
import { EventDetailsUnavailable } from "../../../components/event-details-unavailable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event | Shindig", robots: { index: false, follow: false } };

export default async function EventInvitationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "oyster-roast-2026") redirect("/invitation");
  let event;
  try { event = await getPublishedEvent(slug); } catch { return <EventDetailsUnavailable />; }
  if (!event) notFound();
  return <InvitationPage persistenceDisabled={false} event={event} />;
}
