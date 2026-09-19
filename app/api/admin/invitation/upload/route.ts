import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { OYSTER_ROAST_EVENT } from "../../../../../lib/oyster-roast-event";

const prefix = `invitation/${OYSTER_ROAST_EVENT.slug}/`;

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = await request.json();
    if (!body || !["blob.generate-client-token", "blob.upload-completed"].includes(body.type)) throw new Error("Invalid upload request");
  } catch { return Response.json({ error: "Invalid upload request." }, { status: 400 }); }
  if (body.type === "blob.generate-client-token" && !(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return Response.json({ error: "Image storage is not configured." }, { status: 503 });
  try {
    const response = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await isAdminAuthenticated())) throw new Error("Unauthorized");
        if (!pathname.startsWith(prefix) || !/^[a-zA-Z0-9._-]+\.(png|jpe?g|webp|avif)$/i.test(pathname.slice(prefix.length))) throw new Error("Invalid image path");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
          maximumSizeInBytes: 10 * 1024 * 1024, addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      // Upload-completed callbacks are verified by the Blob SDK, not by a guest
      // session. Uploading alone never publishes or writes invitation settings.
      onUploadCompleted: async () => undefined,
    });
    return Response.json(response);
  } catch { return Response.json({ error: "The image upload could not be authorized." }, { status: 400 }); }
}
