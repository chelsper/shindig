import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ neon: vi.fn(), sql: vi.fn(), event: { slug: "oyster-roast-2026", features: { questions: true, updates: true } } }));
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("../lib/oyster-roast-event", () => ({ OYSTER_ROAST_EVENT: mocks.event }));

import { insertGuestQuestion, listPublicQuestions, listQuestionsForAdmin, removeQuestion, saveQuestionAnswer } from "../lib/server/questions";
import { insertHostUpdate, listHostUpdatesForAdmin, listPublicHostUpdates, removeHostUpdate, updateHostUpdate } from "../lib/server/updates";

const id = "9d366c85-1b73-4c3e-99e8-e751d75965aa";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
  mocks.neon.mockReturnValue(mocks.sql);
  mocks.sql.mockResolvedValue([]);
  mocks.event.features.questions = true;
  mocks.event.features.updates = true;
});

describe("public event content privacy", () => {
  it("selects only answered, explicitly published questions in SQL and strips private fields", async () => {
    mocks.sql.mockResolvedValue([{ question: "Bring chairs?", answer: "Yes!", guestName: "Private Person", id, createdAt: "private timestamp", submissionHash: "secret" }]);
    await expect(listPublicQuestions()).resolves.toEqual([{ question: "Bring chairs?", answer: "Yes!" }]);
    const [parts, slug] = mocks.sql.mock.calls[0];
    const query = parts.join("?");
    expect(query.split("FROM")[0].trim()).toBe("SELECT question, answer");
    expect(query).toContain("is_published = true");
    expect(query).toContain("answer IS NOT NULL AND char_length(btrim(answer)) > 0");
    expect(query).toContain("published_at IS NOT NULL");
    expect(query).toContain("ORDER BY published_at DESC, id DESC");
    expect(slug).toBe("oyster-roast-2026");
  });

  it("returns only heading, message and publication time for updates, newest first", async () => {
    mocks.sql.mockResolvedValue([{ heading: null, message: "Hello", publishedAt: "2026-10-01T20:00:00Z", id, updatedAt: "private" }]);
    await expect(listPublicHostUpdates()).resolves.toEqual([{ heading: null, message: "Hello", publishedAt: "2026-10-01T20:00:00.000Z" }]);
    const [parts, slug] = mocks.sql.mock.calls[0];
    expect(parts.join("?").split("FROM")[0]).not.toMatch(/\b(id|updated_at)\b/);
    expect(parts.join("?")).toContain("ORDER BY published_at DESC, id DESC");
    expect(slug).toBe("oyster-roast-2026");
  });

  it("does not even connect to Neon for disabled public modules", async () => {
    mocks.event.features.questions = false;
    mocks.event.features.updates = false;
    await expect(listPublicQuestions()).resolves.toEqual([]);
    await expect(listPublicHostUpdates()).resolves.toEqual([]);
    expect(mocks.neon).not.toHaveBeenCalled();
  });

  it("always inserts a question privately, with atomic retry deduplication and no raw token storage", async () => {
    const input = { requestToken: id, question: "Chairs?", guestName: null };
    await Promise.all([insertGuestQuestion(input), insertGuestQuestion(input)]);
    for (const [parts, generatedId, slug, question, guestName, submissionHash] of mocks.sql.mock.calls) {
      expect(parts.join("?")).toContain("?, NULL, false, NULL)");
      expect(parts.join("?")).toContain("ON CONFLICT (submission_hash) DO NOTHING");
      expect(generatedId).toMatch(/^[0-9a-f-]{36}$/);
      expect(slug).toBe("oyster-roast-2026");
      expect(question).toBe("Chairs?");
      expect(guestName).toBe(null);
      expect(submissionHash).toBe(createHash("sha256").update(id).digest("hex"));
    }
  });
});

describe("host content data access", () => {
  it("keeps private guest names confined to the admin query", async () => {
    mocks.sql.mockResolvedValue([{ id, question: "Chairs?", guestName: "Private Person", answer: null, isPublished: false, createdAt: "2026-10-01T20:00:00Z", submissionHash: "secret" }]);
    await expect(listQuestionsForAdmin()).resolves.toEqual([{ id, question: "Chairs?", guestName: "Private Person", answer: null, isPublished: false, createdAt: "2026-10-01T20:00:00.000Z" }]);
    expect(mocks.sql.mock.calls[0][0].join("?")).toContain("ORDER BY created_at DESC, id DESC");
  });

  it("returns update IDs only in the host data shape", async () => {
    mocks.sql.mockResolvedValue([{ id, heading: "Hi", message: "Hello", publishedAt: "2026-10-01T20:00:00Z" }]);
    await expect(listHostUpdatesForAdmin()).resolves.toEqual([{ id, heading: "Hi", message: "Hello", publishedAt: "2026-10-01T20:00:00.000Z" }]);
  });

  it("publishes and unpublishes atomically, clearing the public timestamp when unpublished", async () => {
    mocks.sql.mockResolvedValue([{ updated: 1 }]);
    for (const isPublished of [true, false]) {
      await expect(saveQuestionAnswer(id, { answer: "Yes", isPublished })).resolves.toBe(true);
      const [parts, ...values] = mocks.sql.mock.lastCall!;
      expect(parts.join("?")).toContain("published_at = CASE WHEN ? THEN COALESCE(published_at, now()) ELSE NULL END");
      expect(parts.join("?")).toContain("updated_at = now()");
      expect(values).toEqual(["Yes", isPublished, isPublished, "oyster-roast-2026", id]);
    }
  });

  it("makes update creation idempotent and preserves publication date during editing", async () => {
    await insertHostUpdate(id, { heading: null, message: "Hello" });
    expect(mocks.sql.mock.calls[0][0].join("?")).toContain("ON CONFLICT (id) DO NOTHING");
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([id, "oyster-roast-2026", null, "Hello"]);
    mocks.sql.mockResolvedValue([{ updated: 1 }]);
    expect(await updateHostUpdate(id, { heading: "Hi", message: "Hello again" })).toBe(true);
    const [parts, ...values] = mocks.sql.mock.lastCall!;
    expect(parts.join("?")).not.toContain("published_at =");
    expect(parts.join("?")).toContain("updated_at = now()");
    expect(values).toEqual(["Hi", "Hello again", "oyster-roast-2026", id]);
  });

  it.each([removeQuestion, removeHostUpdate])("scopes deletions to one ID and the canonical event", async (remove) => {
    await remove(id);
    const [parts, ...values] = mocks.sql.mock.lastCall!;
    expect(parts.join("?")).toContain("WHERE event_slug = ? AND id = ?::uuid");
    expect(values).toEqual(["oyster-roast-2026", id]);
  });

  it("reports a missing question or update instead of claiming a change", async () => {
    expect(await saveQuestionAnswer(id, { answer: null, isPublished: false })).toBe(false);
    expect(await updateHostUpdate(id, { heading: null, message: "Hello" })).toBe(false);
  });

  it("fails without a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(insertGuestQuestion({ requestToken: id, question: "?", guestName: null })).rejects.toThrow("not configured");
    await expect(insertHostUpdate(id, { heading: null, message: "Hello" })).rejects.toThrow("not configured");
    expect(mocks.neon).not.toHaveBeenCalled();
  });
});
