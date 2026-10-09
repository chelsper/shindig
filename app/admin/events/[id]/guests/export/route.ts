import { isHostAuthenticated } from "../../../../../../lib/server/host-access";
import { isDraftId } from "../../../../../../lib/event-drafts";
import { draftEventSlug } from "../../../../../../lib/event-routes";
import { resolveHostEventScope } from "../../../../../../lib/server/event-scope";
import { listRsvps } from "../../../../../../lib/server/rsvps";
import { rsvpsToCsv } from "../../../../../../lib/server/rsvp-csv";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) return new Response("Unauthorized", { status: 401, headers });
  const { id } = await context.params;
  if (!isDraftId(id)) return new Response("Not found", { status: 404, headers });
  try {
    const scope = await resolveHostEventScope(draftEventSlug(id));
    if (!scope) return new Response("Not found", { status: 404, headers });
    return new Response(rsvpsToCsv(await listRsvps("all", scope)), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="event-rsvps.csv"' } });
  } catch { return new Response("Export temporarily unavailable.", { status: 503, headers }); }
}
