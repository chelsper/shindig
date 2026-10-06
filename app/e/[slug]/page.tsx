import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolvePublicEventScope } from "../../../lib/server/event-scope";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event | Shindig", robots: { index: false, follow: false } };

export default async function EventInvitationPage({ params }: { params: Promise<{ slug: string }> }) {
  const scope = resolvePublicEventScope((await params).slug);
  if (!scope) notFound();
  // The sole published event retains its current routes, calendar links and UI.
  redirect("/invitation");
}
