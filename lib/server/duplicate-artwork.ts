import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import { isHostAuthenticated, requireOwnedEvent, requireOwnedCopyReservation } from "./host-access";
import { isAdminAuthenticated } from "./admin-session";
import { draftImageStorageToken } from "./event-draft-artwork";
import { DRAFT_IMAGE_LIMIT, EMPTY_DRAFT_ARTWORK, isDraftImagePath, validateDraftArtwork, type DraftArtwork, type DraftImageKind } from "../event-draft-artwork";
import { isDraftId } from "../event-drafts";
import { OYSTER_ROAST_EVENT } from "../oyster-roast-event";
import { EventDuplicationError, isDuplicationSource } from "../event-duplication";

export type CopyArtworkSource = {
  design?: DraftArtwork["design"];
  key: string;
  images: Record<DraftImageKind, { locator: string; alt: string } | null>;
  crop: Pick<DraftArtwork["header"], "focalX" | "focalY" | "zoomPercent">;
};
const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" };

export function isLegacyCopyImage(value: string, kind: DraftImageKind) {
  if (value === OYSTER_ROAST_EVENT.invitation.imageUrl) return true;
  try {
    const url = new URL(value);
    const prefix = kind === "invitation" ? "invitation" : "event-hub";
    return url.protocol === "https:" && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      url.pathname.startsWith(`/${prefix}/${OYSTER_ROAST_EVENT.slug}/`) && /\.(png|jpe?g|webp|avif)$/i.test(url.pathname) &&
      !url.port && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

async function bytesFrom(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > DRAFT_IMAGE_LIMIT) throw new Error("Image too large.");
      chunks.push(value);
    }
    if (!size) throw new Error("Empty image.");
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function validImage(bytes: Buffer, type: string) {
  if (type === "image/png") return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return type === "image/avif" && bytes.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(bytes.toString("ascii", 8, 12));
}

async function loadImage(source: CopyArtworkSource, kind: DraftImageKind, token: string) {
  const locator = source.images[kind]!.locator;
  if (source.key !== OYSTER_ROAST_EVENT.slug) {
    if (!isDraftImagePath(source.key, locator, kind)) throw new Error("Wrong source artwork.");
    const blob = await get(locator, { access: "private", token, useCache: false, abortSignal: AbortSignal.timeout(15000) });
    if (!blob || blob.statusCode !== 200) throw new Error("Artwork unavailable.");
    if (blob.blob.size > DRAFT_IMAGE_LIMIT || !extensions[blob.blob.contentType]) { await blob.stream.cancel(); throw new Error("Artwork unavailable."); }
    return { bytes: await bytesFrom(blob.stream), type: blob.blob.contentType };
  }
  if (!isLegacyCopyImage(locator, kind)) throw new Error("Invalid source artwork.");
  if (locator === OYSTER_ROAST_EVENT.invitation.imageUrl) return { bytes: await readFile(join(process.cwd(), "public/oyster-roast-invitation.png")), type: "image/png" };
  // Only an already-saved legacy Blob URL, no redirects, cookies or credentials.
  const response = await fetch(locator, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !response.body || !extensions[type] || Number(response.headers.get("content-length")) > DRAFT_IMAGE_LIMIT) { await response.body?.cancel(); throw new Error("Artwork unavailable."); }
  return { bytes: await bytesFrom(response.body), type };
}

// Called only after a DB reservation has bound this new ID to this source/version.
// Each copy lives under the destination ID; it never refers to the source file.
export async function copyEventArtwork(id: string, source: CopyArtworkSource): Promise<DraftArtwork> {
  if (!(await isHostAuthenticated())) throw new Error("Host access required.");
  if (!isDraftId(id) || !isDuplicationSource(source.key) || source.key === id) throw new Error("Invalid artwork copy.");
  if (source.key === OYSTER_ROAST_EVENT.slug) {
    if (!(await isAdminAuthenticated())) throw new Error("Event unavailable.");
  } else await requireOwnedEvent(source.key);
  await requireOwnedCopyReservation(id, source.key);
  const artwork = structuredClone(EMPTY_DRAFT_ARTWORK); Object.assign(artwork.header, source.crop);
  if (source.design) artwork.design = structuredClone(source.design);
  const token = draftImageStorageToken();
  if ((source.images.invitation || source.images.header) && !token) throw new EventDuplicationError("Copying artwork needs the private image store. Check EVENT_DRAFT_BLOB_READ_WRITE_TOKEN, then retry this copy.");
  for (const kind of ["invitation", "header"] as const) {
    const image = source.images[kind]; if (!image) continue;
    const { bytes, type } = await loadImage(source, kind, token!);
    if (!bytes.length || bytes.length > DRAFT_IMAGE_LIMIT || !validImage(bytes, type)) throw new Error("Invalid artwork bytes.");
    // Content-derived UUID-shaped filename makes same-request retries stable,
    // including retries after a storage response was lost. No overwrite/deletion.
    const hex = createHash("sha256").update(bytes).digest("hex");
    const name = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const path = `event-drafts/${id}/${kind}/${name}.${extensions[type]}`;
    try {
      const result = await put(path, bytes, { access: "private", token: token!, contentType: type, addRandomSuffix: false, allowOverwrite: false, abortSignal: AbortSignal.timeout(15000) });
      if (result.pathname !== path || !/^https:\/\/[a-z0-9-]+\.private\.blob\.vercel-storage\.com\//.test(result.url)) throw new Error("Invalid copy destination.");
    } catch (error) {
      // An uncertain write or concurrent retry may have already created it.
      // Compare actual bytes, not just metadata, before accepting that copy.
      const existing = await get(path, { access: "private", token: token!, useCache: false, abortSignal: AbortSignal.timeout(15000) });
      if (!existing || existing.statusCode !== 200) throw error;
      if (existing.blob.contentType !== type || existing.blob.size !== bytes.length) { await existing.stream.cancel(); throw error; }
      if (!(await bytesFrom(existing.stream)).equals(bytes)) throw error;
    }
    Object.assign(artwork[kind], { path, alt: image.alt });
  }
  const validated = validateDraftArtwork(id, artwork);
  if (!validated.ok) throw new Error("Invalid copied artwork.");
  return validated.settings;
}
