import { get } from "@vercel/blob";
import { getEventPublication } from "../../../../../lib/server/event-publications";
import { draftImageStorageToken } from "../../../../../lib/server/event-draft-artwork";
import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_TYPES, isDraftImageKind } from "../../../../../lib/event-draft-artwork";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
// This route accepts a published event + image role, NEVER a blob pathname/URL.
// Unpublished replacement artwork stays inaccessible, even after first publish.
export async function GET(_request: Request, context: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await context.params;
  if (!isDraftImageKind(kind)) return new Response("Not found.", { status: 404, headers });
  try {
    const publication = await getEventPublication(slug);
    if (!publication) return new Response("Not found.", { status: 404, headers });
    const art = publication.snapshot.artwork;
    const path = kind === "invitation" ? art.invitation.path : art.header.path ?? art.invitation.path;
    if (!path) return new Response("Not found.", { status: 404, headers });
    const token = draftImageStorageToken();
    if (!token) throw new Error("Storage unavailable");
    const result = await get(path, { access: "private", token });
    if (!result || result.statusCode !== 200 || result.blob.size > DRAFT_IMAGE_LIMIT || !DRAFT_IMAGE_TYPES.some((t) => t === result.blob.contentType)) throw new Error("Artwork unavailable");
    return new Response(result.stream, { headers: { ...headers, "Content-Type": result.blob.contentType, "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new Response("Artwork temporarily unavailable.", { status: 503, headers }); }
}
