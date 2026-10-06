import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedEvent } from "../../../../../lib/server/event-publications";
import { resolvePublicEventScope } from "../../../../../lib/server/event-scope";
import { getRsvpForGuest } from "../../../../../lib/server/rsvps";
import { isValidRsvpEditToken } from "../../../../../lib/rsvp-edit-token";
import { hashRsvpEditToken } from "../../../../../lib/server/rsvp-edit-token";
import { RsvpUpdateForm } from "../../../../../components/rsvp/rsvp-update-form";
import { EventDetailsUnavailable } from "../../../../../components/event-details-unavailable";
export const dynamic = "force-dynamic";
export const metadata = { title: "Update your RSVP | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function EditRsvp({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  let data;
  try { data = await Promise.all([getPublishedEvent(slug), resolvePublicEventScope(slug)]); }
  catch { return <EventDetailsUnavailable />; }
  const [event, scope] = data;
  if (!event || !scope) notFound();
  let rsvp;
  try { rsvp = isValidRsvpEditToken(token) ? await getRsvpForGuest(hashRsvpEditToken(token), scope) : null; }
  catch { return <EventDetailsUnavailable />; }
  if (!rsvp) return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="font-serif text-3xl">This private RSVP link isn’t available</h1><p className="mt-4 text-sm leading-6">Check that you’re using the complete link saved after your RSVP.</p><Link className="primary-button mt-5 inline-flex" href={event.eventHub.path}>Back to Event Hub</Link></main>;
  return <RsvpUpdateForm initialRsvp={rsvp} token={token} event={event} />;
}
