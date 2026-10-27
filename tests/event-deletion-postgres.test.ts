// Real SQL against an isolated in-memory database; never connects to Neon.
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ principal: { ownerId: "alice", name: "Alice", email: "alice@example.test" } as { ownerId: string | null; name: string; email: string | null } | null, list: vi.fn(), del: vi.fn(), loseResponse: false }));
vi.mock("../lib/server/host-access", () => ({
  requireHostPrincipal: async () => { if (!state.principal) throw new Error("Host access required"); return state.principal; },
  isHostAuthenticated: async () => !!state.principal,
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
vi.mock("@vercel/blob", () => ({ list: state.list, del: state.del, head: vi.fn() }));
import { cleanupDeletedEventArtwork, deleteOwnedEvent, getEventDeletionReceipt, getEventDeletionReview, listPendingEventDeletions } from "../lib/server/event-deletion";
import { getEventPublication, isEventAliasAvailable, publishEventRecord } from "../lib/server/event-publications";
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { draft, snapshot } from "./fixtures/publication";

const embedded = process.env.SHINDIG_TEST_PGLITE;
let db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  const sql = parts.reduce((s, part, i) => s + part + (i < values.length ? `$${i + 1}` : ""), "");
  const result = await db.query(sql, values);
  if (state.loseResponse && sql.includes("SELECT shindig_delete_owned_event")) { state.loseResponse = false; throw new Error("Lost committed response"); }
  return result.rows;
}
function as(owner: string | null) { state.principal = { ownerId: owner, name: owner ?? "Site administrator", email: owner ? `${owner}@example.test` : null }; }
async function make(owner: string | null = "alice", published = true) {
  const id = randomUUID(), slug = `event-${id}`, alias = `party-${id}`, rsvp = randomUUID(), song = randomUUID(), poll = randomUUID(), option = randomUUID(), item = randomUUID();
  await db.query("INSERT INTO events(id,title,owner_host_id) VALUES ($1,'Private gathering',$2)", [id, owner]);
  await db.query("INSERT INTO event_draft_artwork(event_id,settings) VALUES ($1,$2::jsonb)", [id, JSON.stringify(snapshot.artwork)]);
  await db.query("INSERT INTO event_draft_settings(event_id,max_party_size,allow_comments,guest_list_default_visible,features) VALUES ($1,4,false,false,$2::jsonb)", [id, JSON.stringify(snapshot.settings.features)]);
  if (published) await db.query("INSERT INTO event_publications(event_id,slug,snapshot,source_revisions,public_alias) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)", [id, slug, JSON.stringify({ ...snapshot, details: { ...draft, id, revision: 1 } }), JSON.stringify({ details: 1, settings: 1, artwork: 1, publication: 0 }), alias]);
  await db.query("INSERT INTO rsvps(id,event_slug,guest_name,attending,party_size,comment) VALUES ($1,$2,'Private guest',true,2,'Private comment')", [rsvp, slug]);
  await db.query("INSERT INTO rsvp_contact_preferences(rsvp_id,email,email_consented_at,revision) VALUES ($1,'private@example.test',now(),1)", [rsvp]);
  await db.query("INSERT INTO event_invitees(id,event_slug,guest_name,email,rsvp_id) VALUES ($1,$2,'Private contact','contact@example.test',$3)", [randomUUID(), slug, rsvp]);
  await db.query("INSERT INTO event_contact_settings(event_slug) VALUES ($1)", [slug]);
  await db.query("INSERT INTO playlist_suggestions(id,event_slug,song_title,artist) VALUES ($1,$2,'Song','Artist')", [song, slug]);
  await db.query("INSERT INTO playlist_applause(playlist_suggestion_id,event_slug,voter_token_hash) VALUES ($1,$2,$3)", [song, slug, "a".repeat(64)]);
  await db.query("INSERT INTO event_questions(event_slug,question,submission_hash) VALUES ($1,'Private question',$2)", [slug, id.replaceAll("-", "").repeat(2)]);
  await db.query("INSERT INTO event_updates(event_slug,message) VALUES ($1,'Host update')", [slug]);
  await db.query("INSERT INTO polls(id,event_slug,question) VALUES ($1,$2,'Poll?')", [poll, slug]);
  await db.query("INSERT INTO poll_options(id,poll_id,option_text,sort_order) VALUES ($1,$2,'Option',0)", [option, poll]);
  await db.query("INSERT INTO poll_votes(poll_id,poll_option_id,voter_token_hash,allow_multiple) VALUES ($1,$2,$3,false)", [poll, option, "b".repeat(64)]);
  await db.query("INSERT INTO potluck_items(id,public_key,event_slug,title,needed) VALUES ($1,$2,$3,'Ice',2)", [item, randomUUID(), slug]);
  await db.query("INSERT INTO potluck_claims(event_slug,item_id,edit_token_hash,requester_hash,guest_name,quantity) VALUES ($1,$2,$3,$4,'Private helper',1)", [slug, item, "c".repeat(64), "d".repeat(64)]);
  await db.query("INSERT INTO event_duplication_requests(id,source_key,source_fingerprint,requested_title,completed_event_id,completed_at,owner_host_id) VALUES ($1,$2,$3,'Copied private title',$1,now(),$4)", [id, randomUUID(), "e".repeat(64), owner]);
  return { id, slug, alias, rsvp, song, poll, option, item };
}
async function input(id: string) { return { ...await getEventDeletionReview(id), phrase: "DELETE", confirmed: true }; }
async function removed(event: Awaited<ReturnType<typeof make>>) {
  for (const [table, column, value] of [
    ...["events", "event_duplication_requests"].map(t => [t, "id", event.id]),
    ...["event_draft_artwork", "event_draft_settings", "event_publications", "event_data_scopes"].map(t => [t, "event_id", event.id]),
    ...["rsvps", "event_invitees", "event_contact_settings", "playlist_suggestions", "playlist_applause", "event_questions", "event_updates", "polls", "potluck_items", "potluck_claims"].map(t => [t, "event_slug", event.slug]),
    ["poll_options", "poll_id", event.poll], ["poll_votes", "poll_id", event.poll], ["rsvp_contact_preferences", "rsvp_id", event.rsvp],
  ]) expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [value])).rows[0].n, table).toBe(0);
}
describe.skipIf(!embedded)("permanent event deletion in disposable PostgreSQL", () => {
  let preMigrationEvent: Awaited<ReturnType<typeof make>>;
  beforeAll(async () => {
    if (!embedded || !/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embedded)) throw new Error("Disposable local PGlite only");
    const { PGlite } = await import(/* @vite-ignore */ embedded); db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter(f => f.endsWith(".sql") && !f.startsWith("027_")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    await db.exec(`INSERT INTO host_users(id,name,email) VALUES ('alice','Alice','alice@example.test'),('bob','Bob','bob@example.test')`);
    preMigrationEvent = await make();
    await db.exec(await readFile("db/migrations/027_event_deletion.sql", "utf8"));
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/deletion_test"); vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", "test-private-store");
  }, 30000);
  beforeEach(() => { as("alice"); state.loseResponse = false; state.list.mockReset().mockResolvedValue({ blobs: [], hasMore: false }); state.del.mockReset().mockResolvedValue(undefined); });
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

  it("backfills existing public links without changing live events or guest records", async () => {
    expect((await db.query("SELECT event_id FROM event_public_link_reservations WHERE public_alias=$1", [preMigrationEvent.alias])).rows[0].event_id).toBe(preMigrationEvent.id);
    expect(await getEventPublication(preMigrationEvent.alias)).not.toBeNull();
    expect((await db.query("SELECT guest_name FROM rsvps WHERE id=$1", [preMigrationEvent.rsvp])).rows[0].guest_name).toBe("Private guest");
  });
  it.each(["published", "unpublished", "archived", "draft"])("atomically removes %s event data, while preserving another host and Jasper", async status => {
    const a = await make("alice", status !== "draft"), b = await make("bob");
    if (["unpublished", "archived"].includes(status)) await db.query("UPDATE event_publications SET visibility=$2,rsvps_open=false WHERE event_id=$1", [a.id, status]);
    const review = await input(a.id);
    expect(await deleteOwnedEvent(review)).toMatchObject({ id: a.id, artworkCleanedAt: null });
    await removed(a);
    expect(await getEventPublication(a.slug)).toBeNull(); expect(await getEventPublication(a.alias)).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM rsvps WHERE event_slug=$1", [b.slug])).rows[0].n).toBe(1);
    expect((await db.query("SELECT slug FROM event_data_scopes WHERE slug='oyster-roast-2026'")).rows).toHaveLength(1);
    expect(JSON.stringify((await db.query("SELECT * FROM event_deletions WHERE event_id=$1", [a.id])).rows)).not.toMatch(/Private gathering|Private guest|private@example|comment/);
    expect(await deleteOwnedEvent(review)).toMatchObject({ id: a.id });
  });
  it("rejects forged ownership, anonymous users, other-host receipts, and legacy access to Google events", async () => {
    const b = await make("bob"); as("bob"); const value = await input(b.id); as("alice");
    expect(await getEventDeletionReview(b.id)).toBeNull();
    expect(await deleteOwnedEvent({ ...value, ownerId: "bob" })).toBe("missing");
    expect(await cleanupDeletedEventArtwork(b.id)).toBeNull();
    as(null); expect(await deleteOwnedEvent(value)).toBe("missing");
    as("bob"); await deleteOwnedEvent(value); as("alice");
    expect(await getEventDeletionReceipt(b.id)).toBeNull();
    expect((await listPendingEventDeletions()).some(r => r.id === b.id)).toBe(false);
    state.principal = null; await expect(deleteOwnedEvent(value)).rejects.toThrow("Host access"); await expect(getEventDeletionReview(b.id)).rejects.toThrow("Host access");
    expect(state.list).not.toHaveBeenCalled();
  });
  it("rejects changed details, publication, artwork and settings revisions", async () => {
    const a = await make(), value = await input(a.id);
    for (const key of ["details", "publication", "artwork", "settings"] as const) expect(await deleteOwnedEvent({ ...value, [key]: 999 })).toBe("stale");
    expect(await deleteOwnedEvent({ ...value, title: "Not reviewed" })).toBe("stale");
    expect(await getEventDeletionReceipt(a.id)).toBeNull(); expect(await getEventDeletionReview(a.id)).not.toBeNull();
  });
  it("keeps legacy receipts separate from deleted Google accounts", async () => {
    const legacy = await make(null);
    expect(await getEventDeletionReview(legacy.id)).toBeNull();
    as(null); await deleteOwnedEvent(await input(legacy.id));
    expect(await getEventDeletionReceipt(legacy.id)).toMatchObject({ id: legacy.id });
    as("alice"); expect(await getEventDeletionReceipt(legacy.id)).toBeNull();
    await db.exec("INSERT INTO host_users(id,name,email) VALUES ('closed-test','Closed','closed@example.test')");
    const closed = await make("closed-test"); as("closed-test"); await deleteOwnedEvent(await input(closed.id));
    await db.exec("DELETE FROM host_users WHERE id='closed-test'");
    as(null); expect(await getEventDeletionReceipt(closed.id)).toBeNull();
    expect((await listPendingEventDeletions()).some(r => r.id === closed.id)).toBe(false);
  });
  it("rolls back every table if a later database constraint blocks deletion", async () => {
    const a = await make();
    await db.exec("CREATE TABLE deletion_test_blocker(event_id uuid REFERENCES events(id))");
    try {
      await db.query("INSERT INTO deletion_test_blocker VALUES ($1)", [a.id]);
      await expect(deleteOwnedEvent(await input(a.id))).rejects.toThrow();
      expect(await getEventDeletionReceipt(a.id)).toBeNull(); expect(await getEventPublication(a.alias)).not.toBeNull();
      expect((await db.query("SELECT email FROM rsvp_contact_preferences WHERE rsvp_id=$1", [a.rsvp])).rows[0].email).toBe("private@example.test");
    } finally { await db.exec("DROP TABLE deletion_test_blocker"); }
  });
  it("reserves deleted aliases and IDs, including stale creation and publication retries", async () => {
    const a = await make(), value = await input(a.id); await deleteOwnedEvent(value);
    await expect(saveEventDraftRecord(a.id, 0, draft)).rejects.toThrow();
    const replacement = randomUUID(); await saveEventDraftRecord(replacement, 0, draft);
    expect(await isEventAliasAvailable(replacement, a.alias)).toBe(false);
    await expect(db.query("INSERT INTO event_publications(event_id,slug,snapshot,source_revisions,public_alias) VALUES ($1,$2,$3::jsonb,'{}'::jsonb,$4)", [replacement, `event-${replacement}`, JSON.stringify(snapshot), a.alias])).rejects.toThrow();
    expect(await publishEventRecord(a.id, { details: 1, artwork: 1, settings: 1, publication: 1 }, null)).toBeNull();
    await db.exec(await readFile("db/migrations/027_event_deletion.sql", "utf8"));
    expect(await isEventAliasAvailable(replacement, a.alias)).toBe(false);
  });
  it("reconciles a lost database response using the durable owner-only receipt", async () => {
    const a = await make(), value = await input(a.id); state.loseResponse = true;
    await expect(deleteOwnedEvent(value)).rejects.toThrow("Lost committed response");
    expect(await deleteOwnedEvent(value)).toMatchObject({ id: a.id }); await removed(a);
  });
  it("does not delete uploads during the settling period; retries private-prefix cleanup after failures", async () => {
    const a = await make(); await deleteOwnedEvent(await input(a.id));
    expect(await cleanupDeletedEventArtwork(a.id)).toMatchObject({ cleanupReady: false, artworkCleanedAt: null }); expect(state.list).not.toHaveBeenCalled();
    await db.query("UPDATE event_deletions SET deleted_at=now()-interval '4 minutes' WHERE event_id=$1", [a.id]);
    state.list.mockRejectedValueOnce(new Error("Blob unavailable")); await expect(cleanupDeletedEventArtwork(a.id)).rejects.toThrow();
    expect((await getEventDeletionReceipt(a.id))?.artworkCleanedAt).toBeNull();
    const path = `event-drafts/${a.id}/header/${randomUUID()}.png`, url = `https://test.private.blob.vercel-storage.com/${path}`;
    state.list.mockResolvedValueOnce({ blobs: [{ pathname: path, url }], hasMore: true }).mockResolvedValueOnce({ blobs: [], hasMore: false });
    expect(await cleanupDeletedEventArtwork(a.id.toUpperCase())).toMatchObject({ artworkCleanedAt: expect.any(String) });
    expect(state.del).toHaveBeenCalledWith([url], expect.objectContaining({ token: "test-private-store" }));
    for (const [arg] of state.list.mock.calls) expect(arg.prefix).toBe(`event-drafts/${a.id}/`);
  });
  it("rejects unexpected cross-event files and missing storage instead of reporting cleanup success", async () => {
    const a = await make(); await deleteOwnedEvent(await input(a.id));
    await db.query("UPDATE event_deletions SET deleted_at=now()-interval '4 minutes' WHERE event_id=$1", [a.id]);
    state.list.mockResolvedValueOnce({ blobs: [{ pathname: `event-drafts/${randomUUID()}/header/${randomUUID()}.png`, url: "https://test.private.blob.vercel-storage.com/wrong" }], hasMore: false });
    await expect(cleanupDeletedEventArtwork(a.id)).rejects.toThrow("scope"); expect(state.del).not.toHaveBeenCalled();
    vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", ""); await expect(cleanupDeletedEventArtwork(a.id)).rejects.toThrow("unavailable");
    expect((await getEventDeletionReceipt(a.id))?.artworkCleanedAt).toBeNull(); vi.stubEnv("EVENT_DRAFT_BLOB_READ_WRITE_TOKEN", "test-private-store");
  });
});
