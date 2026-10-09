// Disposable in-memory PostgreSQL only. No connection to Neon or guest data.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.authenticated }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
vi.mock("@vercel/blob", () => ({ head: async (path: string) => ({ pathname: path, url: `https://test.private.blob.vercel-storage.com/${path}`, size: 100, contentType: "image/png" }) }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { getDraftArtwork, saveDraftArtworkRecord } from "../lib/server/event-draft-artwork";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getPublishedEvent, publishEventRecord, listHostPublications } from "../lib/server/event-publications";
import { getDuplicationSource } from "../lib/server/event-duplication";
import { EMPTY_DRAFT_ARTWORK, type DraftArtwork } from "../lib/event-draft-artwork";
import { draft, snapshot } from "./fixtures/publication";
const modulePath = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  const statement = parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), "");
  return (await db.query(statement, values)).rows;
}
async function fixture() {
  const id = randomUUID();
  await saveEventDraftRecord(id, 0, draft); await saveDraftSettingsRecord(id, 0, snapshot.settings);
  const artwork: DraftArtwork = { ...EMPTY_DRAFT_ARTWORK, design: { style: "coastal", invitationCrop: { x: 22, y: 77, zoom: 170 } },
    invitation: { path: `event-drafts/${id}/invitation/${randomUUID()}.png`, alt: "Garden" }, header: { ...EMPTY_DRAFT_ARTWORK.header, focalX: 80, zoomPercent: 230 } };
  return { id, slug: `event-${id}`, artwork, versions: { details: 1, artwork: 1, settings: 1, publication: 0 } };
}
describe.skipIf(!modulePath)("saved style → preview → explicit publication PostgreSQL boundary", () => {
  beforeAll(async () => {
    if (!modulePath || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(modulePath)) throw new Error("Use disposable local PGlite only.");
    const { PGlite } = await import(/* @vite-ignore */ modulePath); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/design_test"); vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", "private-test-token");
  }, 30000);
  afterAll(async () => { if (db) await db.close(); vi.unstubAllEnvs(); });
  beforeEach(() => { state.authenticated = true; });
  it("round-trips design and both crops privately; only Publish exposes them", async () => {
    const f = await fixture();
    expect(await saveDraftArtworkRecord(f.id, 0, f.artwork)).toBe(1);
    expect(await getDraftArtwork(f.id)).toEqual({ settings: f.artwork, revision: 1 });
    expect(await getPublishedEvent(f.slug)).toBeNull();
    expect(await publishEventRecord(f.id, f.versions, null)).toBe(1);
    const live = await getPublishedEvent(f.slug);
    expect(live?.design).toEqual(f.artwork.design); expect(live?.eventHub.headerImage.zoomPercent).toBe(230);
    expect(JSON.stringify(live)).not.toContain("event-drafts/");
  });
  it("keeps live styling unchanged after draft save and rejects stale saves/reviews", async () => {
    const f = await fixture(); await saveDraftArtworkRecord(f.id, 0, f.artwork); await publishEventRecord(f.id, f.versions, null);
    const changed: DraftArtwork = { ...f.artwork, design: { style: "after-dark", invitationCrop: { x: 40, y: 60, zoom: 250 } } };
    expect(await saveDraftArtworkRecord(f.id, 1, changed)).toBe(2);
    expect(await saveDraftArtworkRecord(f.id, 1, f.artwork)).toBeNull();
    expect((await getPublishedEvent(f.slug))?.design).toEqual(f.artwork.design);
    expect((await listHostPublications()).find(({ id }) => id === f.id)?.hasUnpublishedChanges).toBe(true);
    expect(await publishEventRecord(f.id, { ...f.versions, publication: 1 }, null)).toBeNull();
    expect(await publishEventRecord(f.id, { ...f.versions, artwork: 2, publication: 1 }, null)).toBe(2);
    expect((await getPublishedEvent(f.slug))?.design).toEqual(changed.design);
    // Lost response retry cannot create another publication or lose appearance.
    expect(await publishEventRecord(f.id, { ...f.versions, artwork: 2, publication: 1 }, null)).toBe(2);
  });
  it("supports explicit return to original layout without modifying the old publication until review", async () => {
    const f = await fixture(); await saveDraftArtworkRecord(f.id, 0, f.artwork); await publishEventRecord(f.id, f.versions, null);
    await saveDraftArtworkRecord(f.id, 1, EMPTY_DRAFT_ARTWORK);
    expect((await getPublishedEvent(f.slug))?.design).toBeDefined();
    await publishEventRecord(f.id, { ...f.versions, artwork: 2, publication: 1 }, null);
    expect(await getPublishedEvent(f.slug)).not.toHaveProperty("design");
  });
  it("includes appearance in duplicate-source data and stale-copy fingerprint", async () => {
    const f = await fixture(); await saveDraftArtworkRecord(f.id, 0, f.artwork);
    const source = await getDuplicationSource(f.id); expect(source?.design).toEqual(f.artwork.design);
    await saveDraftArtworkRecord(f.id, 1, { ...f.artwork, design: { ...f.artwork.design!, style: "classic" } });
    expect((await getDuplicationSource(f.id))?.fingerprint).not.toBe(source?.fingerprint);
  });
  it("does not let unauthenticated callers read/save design or publish", async () => {
    const f = await fixture(); state.authenticated = false;
    await expect(getDraftArtwork(f.id)).rejects.toThrow("Host access");
    await expect(saveDraftArtworkRecord(f.id, 0, f.artwork)).rejects.toThrow("Host access");
    await expect(publishEventRecord(f.id, f.versions, null)).rejects.toThrow("Host access");
    expect(await getPublishedEvent(f.slug)).toBeNull();
  });
  it("rejects malformed/cross-draft settings without replacing saved design", async () => {
    const f = await fixture(); await saveDraftArtworkRecord(f.id, 0, f.artwork);
    for (const invalid of [{ ...f.artwork, design: { style: "evil", invitationCrop: {} } }, { ...f.artwork, invitation: { ...f.artwork.invitation, path: f.artwork.invitation.path!.replace(f.id, randomUUID()) } }]) {
      await expect(saveDraftArtworkRecord(f.id, 1, invalid)).rejects.toThrow("Invalid draft artwork");
    }
    expect(await getDraftArtwork(f.id)).toEqual({ settings: f.artwork, revision: 1 });
  });
});
