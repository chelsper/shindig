import {
  createOysterRoastIcs,
  getRsvpUpdateUrl,
} from "../../../lib/calendar";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { isValidRsvpEditToken } from "../../../lib/rsvp-edit-token";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const editToken = new URL(request.url).searchParams.get("token");
  const rsvpUrl = isValidRsvpEditToken(editToken)
    ? getRsvpUpdateUrl(editToken)
    : undefined;

  return new Response(createOysterRoastIcs(new Date(), rsvpUrl), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Disposition": `attachment; filename="${OYSTER_ROAST_EVENT.calendarFilename}"`,
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}
