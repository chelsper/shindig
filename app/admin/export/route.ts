import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { rsvpsToCsv } from "../../../lib/server/rsvp-csv";
import { listRsvps } from "../../../lib/server/rsvps";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  try {
    const rsvps = await listRsvps("all");
    const csv = rsvpsToCsv(rsvps);

    return new Response(csv, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${OYSTER_ROAST_EVENT.slug}-rsvps.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Unable to export admin RSVP data.", error);

    return new Response("The RSVP export is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
