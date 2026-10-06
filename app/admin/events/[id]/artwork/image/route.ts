import { randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";
import { isAdminAuthenticated } from "../../../../../../lib/server/admin-session";
import { getEventDraft } from "../../../../../../lib/server/event-drafts";
import { draftImageStorageToken } from "../../../../../../lib/server/event-draft-artwork";
import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_TYPES, isDraftImageKind, isDraftImagePath } from "../../../../../../lib/event-draft-artwork";
import { isDraftId } from "../../../../../../lib/event-drafts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: privateHeaders });

// Check image signatures as well as MIME type. SVG/HTML and user-selected URLs
// are never supported. Private bytes are streamed only after host authentication.
function imageExtension(bytes: Uint8Array, type: string): string | null {
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
  if (type === "image/png" && bytes.subarray(0, 8).every((n, i) => n === [137, 80, 78, 71, 13, 10, 26, 10][i]) && bytes.length >= 24) return "png";
  if (type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (type === "image/webp" && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (type === "image/avif" && ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "avif";
  return null;
}

export async function POST(request: Request, context: Context) {
  if (!(await isAdminAuthenticated())) return error("Host access required.", 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return error("Please upload from the draft editor.", 403);
  const { id } = await context.params;
  if (!isDraftId(id)) return error("Draft not found.", 404);
  const token = draftImageStorageToken();
  if (!token) return error("Private image storage is not configured yet.", 503);
  const size = Number(request.headers.get("content-length"));
  if (!Number.isFinite(size) || size < 1 || size > DRAFT_IMAGE_LIMIT + 64 * 1024) return error("Choose an image up to 4 MB.", 413);
  try {
    if (!(await getEventDraft(id))) return error("Draft not found.", 404);
    // Bound the actual body too, not just the client-provided length.
    const reader = request.body?.getReader();
    if (!reader) return error("Choose an image to upload.", 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > DRAFT_IMAGE_LIMIT + 64 * 1024) { await reader.cancel(); return error("Choose an image up to 4 MB.", 413); }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const file = form.get("file"), kind = form.get("kind");
    if (!(file instanceof File) || !isDraftImageKind(kind) || !file.size || file.size > DRAFT_IMAGE_LIMIT) return error("Choose an image up to 4 MB.", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = imageExtension(bytes, file.type);
    if (!extension) return error("Choose a valid JPG, PNG, WebP, or AVIF image.", 400);
    const path = `event-drafts/${id}/${kind}/${randomUUID()}.${extension}`;
    const blob = await put(path, Buffer.from(bytes), { access: "private", token, contentType: file.type, addRandomSuffix: false, allowOverwrite: false });
    if (!new URL(blob.url).hostname.endsWith(".private.blob.vercel-storage.com") || blob.pathname !== path) throw new Error("Invalid private storage response");
    return Response.json({ path }, { headers: privateHeaders });
  } catch { return error("The image couldn’t upload. Please try again.", 503); }
}

export async function GET(request: Request, context: Context) {
  if (!(await isAdminAuthenticated())) return error("Host access required.", 401);
  const { id } = await context.params;
  const path = new URL(request.url).searchParams.get("path");
  if (!isDraftImagePath(id, path)) return error("Image not found.", 404);
  const token = draftImageStorageToken();
  if (!token) return error("Private image storage is not configured yet.", 503);
  try {
    if (!(await getEventDraft(id))) return error("Draft not found.", 404);
    const result = await get(path, { access: "private", token });
    if (!result || result.statusCode !== 200 || result.blob.size > DRAFT_IMAGE_LIMIT || !DRAFT_IMAGE_TYPES.some((type) => type === result.blob.contentType)) return error("Image not found.", 404);
    return new Response(result.stream, { headers: { ...privateHeaders, "Content-Type": result.blob.contentType, "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return error("The image couldn’t load. Please try again.", 503); }
}
