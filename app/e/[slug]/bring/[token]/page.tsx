import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedEvent } from "../../../../../lib/server/event-publications";
import { resolvePublicEventScope } from "../../../../../lib/server/event-scope";
import { getPotluckClaim } from "../../../../../lib/server/potluck";
import { PotluckClaimEditor } from "../../../../../components/potluck/claim-editor";
import { EventDetailsUnavailable } from "../../../../../components/event-details-unavailable";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your bring-something signup | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function BringSignup({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  let data;
  try {
    const [event, scope] = await Promise.all([getPublishedEvent(slug), resolvePublicEventScope(slug)]);
    data = { event, scope, claim: scope?.features.potluck ? await getPotluckClaim(token, scope) : null };
  } catch { return <EventDetailsUnavailable />; }
  if (!data.event || !data.scope?.features.potluck) notFound();
  if (!data.claim) return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="font-serif text-3xl">This private signup link isn’t available</h1><p className="mt-4 text-sm leading-6">Check the complete link saved when you signed up.</p><Link className="mt-5 inline-flex min-h-11 items-center underline" href={data.event.eventHub.path}>Back to Event Hub</Link></main>;
  return <PotluckClaimEditor event={data.event} initial={data.claim} token={token} />;
}
