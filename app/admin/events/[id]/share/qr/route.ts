import { isHostAuthenticated } from "../../../../../../lib/server/host-access";
import { getHostEventPublication } from "../../../../../../lib/server/event-publications";
import { isDraftId } from "../../../../../../lib/event-drafts";
import { draftEventSlug } from "../../../../../../lib/event-routes";
import { createEventQr } from "../../../../../../lib/server/event-qr";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) return new Response("Unauthorized", { status: 401, headers });
  const { id } = await context.params;
  const params = new URL(request.url).searchParams, target = params.get("target"), format = params.get("format") ?? "png";
  if (!isDraftId(id) || (target !== "invitation" && target !== "hub") || (format !== "png" && format !== "svg")) return new Response("Invalid QR request.", { status: 400, headers });
  try {
    const publication = await getHostEventPublication(draftEventSlug(id));
    if (publication?.visibility !== "published") return new Response("Publish this event before downloading a QR code.", { status: 404, headers });
    const slug = publication.publicAlias ?? publication.slug;
    return new Response(await createEventQr(slug, target, format), { headers: { ...headers,
      "Content-Type": format === "svg" ? "image/svg+xml" : "image/png",
      "Content-Disposition": `inline; filename="shindig-${slug}-${target}.${format}"`,
    } });
  } catch { return new Response("QR codes are temporarily unavailable. Please try again.", { status: 503, headers }); }
}
