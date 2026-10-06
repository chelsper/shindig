// Opt-in real PostgreSQL workflow. Never connects to Neon or production.
// Run with SHINDIG_TEST_PG_SOCKET pointing to a /private/tmp Unix socket,
// SHINDIG_TEST_PSQL pointing to psql, and SHINDIG_TEST_PG_PORT (default 55441).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: async () => state.authenticated }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { saveEventDraftRecord } from "../lib/server/event-drafts";
import { saveDraftSettingsRecord } from "../lib/server/event-draft-settings";
import { getPublishedEvent, publishEventRecord } from "../lib/server/event-publications";
import { resolvePublicEventScope, OYSTER_ROAST_SCOPE } from "../lib/server/event-scope";
import { submitEventRsvp, updateEventRsvp } from "../app/e/actions";
import { createEventGuest, updateEventGuest, deleteEventGuest } from "../app/admin/events/[id]/guests/actions";
import { getRsvpForAdmin, getRsvpForGuest, getPublicGuestList, getRsvpSummary, listRsvps } from "../lib/server/rsvps";
import { hashRsvpEditToken } from "../lib/server/rsvp-edit-token";
import { createOysterRoastIcs } from "../lib/calendar";
import { draft, snapshot } from "./fixtures/publication";

const socket = process.env.SHINDIG_TEST_PG_SOCKET;
const embeddedModule = process.env.SHINDIG_TEST_PGLITE;
let embedded: { query: (text: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> } | undefined;
const run = promisify(execFile);
async function sql(text: string) {
  if (!socket || !/^\/private\/tmp\/[a-zA-Z0-9._/-]+$/.test(socket)) throw new Error("A disposable local PostgreSQL socket is required.");
  const { stdout } = await run(process.env.SHINDIG_TEST_PSQL || "psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", process.env.SHINDIG_TEST_PG_PORT || "55441", "-d", "shindig_drafts_test", "-c", text]);
  return stdout.trim();
}
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error("Unsupported test parameter");
}
async function query(parts: TemplateStringsArray, ...values: unknown[]) {
  if (embedded) {
    const statement = parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), "");
    return (await embedded.query(statement, values)).rows;
  }
  const statement = parts.reduce((text, part, index) => text + part + (index < values.length ? literal(values[index]) : ""), "");
  return JSON.parse(await sql(`WITH result AS (${statement}) SELECT coalesce(json_agg(result), '[]'::json) FROM result`));
}
const ids = [randomUUID(), randomUUID()];
const slugs = ids.map((id) => `event-${id}`);
const responseId = randomUUID(), hiddenId = randomUUID(), hostId = randomUUID();
const token = "b".repeat(43), hiddenToken = "c".repeat(43);
const fields = { guestName: "Synthetic Visible", attending: true, partySize: 2, displayOnGuestList: true, comment: "Guest note" };
const initial = { error: null };
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ guestName: "Host Added", attending: "true", partySize: "2", displayOnGuestList: "on", comment: "Host note", ...values })) data.set(key, value);
  return data;
}
describe.skipIf(!socket && !embeddedModule)("real local publish → RSVP → host guest management workflow", () => {
  let legacyBefore: unknown;
  beforeAll(async () => {
    if (embeddedModule) {
      if (!/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embeddedModule)) throw new Error("Use a temporary local PGlite installation only.");
      const { PGlite } = await import(/* @vite-ignore */ embeddedModule);
      embedded = new PGlite(); // Fresh in-memory PostgreSQL, never a saved database.
      for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await embedded!.exec(await readFile(`db/migrations/${file}`, "utf8"));
    } else {
      expect(await sql("SELECT current_database()" )).toBe("shindig_drafts_test");
      expect(await sql("SHOW standard_conforming_strings")).toBe("on");
    }
    vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/shindig_drafts_test");
    legacyBefore = await getRsvpSummary(OYSTER_ROAST_SCOPE);
  }, 30000);
  afterAll(async () => {
    if (embedded) { await embedded.close(); vi.unstubAllEnvs(); return; }
    // Only this run's random synthetic identities, in the named disposable DB.
    const events = ids.map(literal).join(","), scopes = slugs.map(literal).join(",");
    await sql(`BEGIN; DELETE FROM rsvps WHERE event_slug IN (${scopes}); DELETE FROM event_publications WHERE event_id IN (${events}); DELETE FROM event_draft_settings WHERE event_id IN (${events}); DELETE FROM event_data_scopes WHERE event_id IN (${events}); DELETE FROM events WHERE id IN (${events}); COMMIT;`);
    vi.unstubAllEnvs();
  });
  it("publishes two disposable events, then enforces privacy and isolation through real queries", async () => {
    for (const id of ids) {
      expect(await saveEventDraftRecord(id, 0, { ...draft, title: "Synthetic guest management test" })).toEqual({ id, revision: 1 });
      expect(await saveDraftSettingsRecord(id, 0, { ...snapshot.settings, features: { ...snapshot.settings.features, playlist: false, questions: false, updates: false, polls: false } })).toBe(1);
      expect(await getPublishedEvent(`event-${id}`)).toBeNull();
      expect(await publishEventRecord(id, { details: 1, artwork: 0, settings: 1, publication: 0 }, null)).toBe(1);
    }
    const a = (await resolvePublicEventScope(slugs[0]))!, b = (await resolvePublicEventScope(slugs[1]))!;
    const event = (await getPublishedEvent(slugs[0]))!;
    expect(createOysterRoastIcs(new Date(), undefined, event).replaceAll("\r\n ", "")).toContain(`/e/${slugs[0]}/event`);
    state.authenticated = false;
    const submit = { ...fields, eventSlug: slugs[0], submissionId: responseId, editToken: token };
    expect((await submitEventRsvp(slugs[0], submit)).ok).toBe(true);
    expect((await submitEventRsvp(slugs[0], submit)).ok).toBe(true);
    expect((await submitEventRsvp(slugs[0], { ...submit, submissionId: hiddenId, editToken: hiddenToken, guestName: "Synthetic Hidden", partySize: 3, displayOnGuestList: false })).ok).toBe(true);
    expect(await getPublicGuestList(a)).toEqual({ totalGuestCount: 5, guests: [{ guestName: fields.guestName, partySize: 2 }] });
    expect(await getPublicGuestList(b)).toEqual({ totalGuestCount: 0, guests: [] });
    expect(await getRsvpForGuest(hashRsvpEditToken(token), b)).toBeNull();
    expect((await createEventGuest(ids[0], hostId, initial, form())).error).toBeTruthy();
    state.authenticated = true;
    const adds = await Promise.allSettled([createEventGuest(ids[0], hostId, initial, form()), createEventGuest(ids[0], hostId, initial, form())]);
    for (const result of adds) expect(result.status === "rejected" && String(result.reason).includes("saved=create")).toBe(true);
    expect((await getRsvpSummary(a)).totalResponses).toBe(3);
    expect((await listRsvps("attending", a, "host a"))).toHaveLength(1);
    expect((await listRsvps("all", a, "%"))).toHaveLength(0);
    expect((await updateEventGuest(ids[1], responseId, initial, form())).error).toContain("could not be found");
    expect((await deleteEventGuest(ids[1], responseId, initial, form({ confirm: "delete" }))).error).toContain("could not be found");
    expect((await deleteEventGuest(ids[0], responseId, initial, form())).error).toContain("confirm");
    const before = (await getRsvpForAdmin(responseId, a))!;
    await expect(updateEventGuest(ids[0], responseId, initial, form({ guestName: "Host Edited", attending: "false", partySize: "20" }))).rejects.toThrow("saved=update");
    const after = (await getRsvpForAdmin(responseId, a))!;
    expect(after).toMatchObject({ attending: false, partySize: null, displayOnGuestList: false, comment: "Host note", createdAt: before.createdAt });
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
    expect((await getPublicGuestList(a)).totalGuestCount).toBe(5);
    expect((await getPublicGuestList(a)).guests.map((g) => g.guestName)).toEqual(["Host Added"]);
    expect(await getRsvpForGuest(hashRsvpEditToken(token), a)).toMatchObject({ guestName: "Host Edited", attending: false });
    expect((await listRsvps("declined", a))).toHaveLength(1);
    expect((await updateEventGuest(ids[0], responseId, initial, form({ partySize: "5" }))).error).toContain("between 1 and 4");
    state.authenticated = false;
    expect((await updateEventRsvp(slugs[0], { ...fields, partySize: 4, displayOnGuestList: false, editToken: token })).ok).toBe(true);
    expect((await getPublicGuestList(a)).totalGuestCount).toBe(9);
    state.authenticated = true;
    await expect(deleteEventGuest(ids[0], responseId, initial, form({ confirm: "delete" }))).rejects.toThrow("saved=delete");
    expect(await getRsvpForGuest(hashRsvpEditToken(token), a)).toBeNull();
    expect((await getRsvpSummary(a)).totalResponses).toBe(2);
    expect((await getPublicGuestList(a)).totalGuestCount).toBe(5);
    expect(await getRsvpSummary(OYSTER_ROAST_SCOPE)).toEqual(legacyBefore);
    expect((await getRsvpSummary(b)).totalResponses).toBe(0);
    // Saved draft changes cannot silently change the active guest rules.
    await saveDraftSettingsRecord(ids[0], 1, { ...snapshot.settings, rsvp: { ...snapshot.settings.rsvp, maxPartySize: 1 } });
    expect((await resolvePublicEventScope(slugs[0]))!.rsvp.maxPartySize).toBe(4);
  }, 30000);
});
