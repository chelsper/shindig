import {
  createOysterRoastIcs,
  getRsvpUpdateUrl,
} from "../../../lib/calendar";
import { getEventConfiguration } from "../../../lib/server/invitation-settings";
import { isValidRsvpEditToken } from "../../../lib/rsvp-edit-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let event;
  try { event = await getEventConfiguration(); }
  catch { return new Response("Calendar details are unavailable. Please try again shortly.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const editToken = new URL(request.url).searchParams.get("token");
  const rsvpUrl = isValidRsvpEditToken(editToken)
    ? getRsvpUpdateUrl(editToken, event)
    : undefined;

  return new Response(createOysterRoastIcs(new Date(), rsvpUrl, event), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${event.calendarFilename}"`,
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}
