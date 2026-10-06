import { getPublishedEvent } from "../../../../lib/server/event-publications";
import { createOysterRoastIcs, getRsvpUpdateUrl } from "../../../../lib/calendar";
import { isValidRsvpEditToken } from "../../../../lib/rsvp-edit-token";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const event = await getPublishedEvent((await context.params).slug);
    if (!event) return new Response("Event not found.", { status: 404, headers });
    const token = new URL(request.url).searchParams.get("token");
    return new Response(createOysterRoastIcs(new Date(), isValidRsvpEditToken(token) ? getRsvpUpdateUrl(token, event) : undefined, event), {
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${event.calendarFilename}"` },
    });
  } catch { return new Response("Calendar is temporarily unavailable.", { status: 503, headers }); }
}
