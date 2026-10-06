import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolvePublicEventScope } from "../../../../lib/server/event-scope";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event Hub | Shindig", robots: { index: false, follow: false } };

export default async function ScopedEventHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const scope = resolvePublicEventScope((await params).slug);
  if (!scope) notFound();
  redirect("/event");
}
