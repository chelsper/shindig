import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { OYSTER_ROAST_EVENT } from "../../../../../lib/oyster-roast-event";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const PATH_PREFIX = `event-hub/${OYSTER_ROAST_EVENT.slug}/`;

export async function POST(request: Request) {
  let body: HandleUploadBody;

  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    body.type === "blob.generate-client-token" &&
    !(await isAdminAuthenticated())
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "Image storage is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await isAdminAuthenticated())) throw new Error("Unauthorized");
        if (!pathname.startsWith(PATH_PREFIX)) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/avif",
          ],
          maximumSizeInBytes: MAX_IMAGE_SIZE,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1_000,
        };
      },
      onUploadCompleted: async () => undefined,
    });

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "The image upload could not be authorized." },
      { status: 400 },
    );
  }
}
