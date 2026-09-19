import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn(),
  insertQuestion: vi.fn(), saveAnswer: vi.fn(), removeQuestion: vi.fn(), listQuestions: vi.fn(),
  insertUpdate: vi.fn(), editUpdate: vi.fn(), removeUpdate: vi.fn(), listUpdates: vi.fn(),
  event: { slug: "oyster-roast-2026", eventHub: { path: "/event" }, features: { questions: true, updates: true } },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../lib/oyster-roast-event", () => ({ OYSTER_ROAST_EVENT: mocks.event }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.authenticated }));
vi.mock("../lib/server/questions", () => ({ insertGuestQuestion: mocks.insertQuestion, saveQuestionAnswer: mocks.saveAnswer, removeQuestion: mocks.removeQuestion, listQuestionsForAdmin: mocks.listQuestions }));
vi.mock("../lib/server/updates", () => ({ insertHostUpdate: mocks.insertUpdate, updateHostUpdate: mocks.editUpdate, removeHostUpdate: mocks.removeUpdate, listHostUpdatesForAdmin: mocks.listUpdates }));

import { submitGuestQuestion } from "../app/event/question-actions";
import { createHostUpdate, deleteHostUpdate, editHostUpdate } from "../app/admin/updates/actions";
import { answerGuestQuestion, deleteGuestQuestion } from "../app/admin/questions/actions";
import AdminQuestionsPage from "../app/admin/questions/page";
import AdminUpdatesPage from "../app/admin/updates/page";

const id = "9d366c85-1b73-4c3e-99e8-e751d75965aa";
const question = { requestToken: id, question: "Chairs?", guestName: null };
const update = { heading: null, message: "Hello!" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticated.mockResolvedValue(true);
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  mocks.saveAnswer.mockResolvedValue(true);
  mocks.editUpdate.mockResolvedValue(true);
  mocks.event.features.questions = true;
});

describe("guest question submission", () => {
  it("accepts without guest authentication, ignores forged host fields and returns only acknowledgment", async () => {
    await expect(submitGuestQuestion({ ...question, isPublished: true, answer: "Forged", eventSlug: "another" })).resolves.toEqual({ ok: true });
    expect(mocks.insertQuestion).toHaveBeenCalledWith(question);
    expect(mocks.authenticated).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/questions");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/event");
  });
  it("rejects disabled features and invalid input before database access", async () => {
    expect((await submitGuestQuestion({ ...question, question: " " })).ok).toBe(false);
    mocks.event.features.questions = false;
    expect((await submitGuestQuestion(question)).ok).toBe(false);
    expect(mocks.insertQuestion).not.toHaveBeenCalled();
  });
  it("does not acknowledge success or reveal details on database failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.insertQuestion.mockRejectedValue(new Error("postgresql://secret"));
    const result = await submitGuestQuestion(question);
    expect(result).toEqual({ ok: false, message: "We couldn’t send your question. Please try again in a moment." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    log.mockRestore();
  });
});

describe("host content authorization and moderation", () => {
  it("protects both host pages before querying private records", async () => {
    mocks.authenticated.mockResolvedValue(false);
    await expect(AdminQuestionsPage()).rejects.toThrow("NEXT_REDIRECT");
    await expect(AdminUpdatesPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listQuestions).not.toHaveBeenCalled();
    expect(mocks.listUpdates).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });
  it("denies every host mutation without an authenticated session", async () => {
    mocks.authenticated.mockResolvedValue(false);
    const results = await Promise.all([
      createHostUpdate(id, update), editHostUpdate(id, update), deleteHostUpdate(id, true),
      answerGuestQuestion(id, { answer: "Yes", isPublished: true }), deleteGuestQuestion(id, true),
    ]);
    for (const result of results) expect(result).toEqual({ ok: false, message: "Your host session has expired. Please sign in again." });
    for (const fn of [mocks.insertUpdate, mocks.editUpdate, mocks.removeUpdate, mocks.saveAnswer, mocks.removeQuestion, mocks.revalidatePath]) expect(fn).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs, empty messages and publishing unanswered questions", async () => {
    expect((await createHostUpdate("invalid", update)).ok).toBe(false);
    expect((await createHostUpdate(id, { message: " " })).ok).toBe(false);
    expect((await editHostUpdate(id, { message: " " })).ok).toBe(false);
    expect((await answerGuestQuestion("invalid", { answer: "Yes", isPublished: true })).ok).toBe(false);
    expect((await answerGuestQuestion(id, { answer: " ", isPublished: true })).ok).toBe(false);
    expect(mocks.insertUpdate).not.toHaveBeenCalled();
    expect(mocks.editUpdate).not.toHaveBeenCalled();
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });
  it("creates and edits validated updates, refreshing the hub and host page", async () => {
    await expect(createHostUpdate(id, { heading: " Hi ", message: " Hello! " })).resolves.toEqual({ ok: true });
    expect(mocks.insertUpdate).toHaveBeenCalledWith(id, { heading: "Hi", message: "Hello!" });
    await expect(editHostUpdate(id, update)).resolves.toEqual({ ok: true });
    expect(mocks.editUpdate).toHaveBeenCalledWith(id, update);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/updates");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
  });
  it.each([true, false])("saves an explicit publication choice of %s", async (isPublished) => {
    await expect(answerGuestQuestion(id, { answer: " Yes! ", isPublished })).resolves.toEqual({ ok: true });
    expect(mocks.saveAnswer).toHaveBeenCalledWith(id, { answer: "Yes!", isPublished });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/questions");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
  });
  it("requires explicit confirmation before deleting either kind of content", async () => {
    expect((await deleteGuestQuestion(id, false)).ok).toBe(false);
    expect((await deleteHostUpdate(id, false)).ok).toBe(false);
    expect((await deleteGuestQuestion("invalid", true)).ok).toBe(false);
    expect((await deleteHostUpdate("invalid", true)).ok).toBe(false);
    expect(mocks.removeQuestion).not.toHaveBeenCalled();
    expect(mocks.removeUpdate).not.toHaveBeenCalled();
  });
  it("deletes confirmed content and invalidates the public view", async () => {
    await expect(deleteGuestQuestion(id, true)).resolves.toEqual({ ok: true });
    await expect(deleteHostUpdate(id, true)).resolves.toEqual({ ok: true });
    expect(mocks.removeQuestion).toHaveBeenCalledWith(id);
    expect(mocks.removeUpdate).toHaveBeenCalledWith(id);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
  });
  it("handles missing records without a false success", async () => {
    mocks.editUpdate.mockResolvedValue(false);
    mocks.saveAnswer.mockResolvedValue(false);
    expect((await editHostUpdate(id, update)).ok).toBe(false);
    expect((await answerGuestQuestion(id, { answer: "Yes", isPublished: true })).ok).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("returns friendly errors for failed host writes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fn of [mocks.insertUpdate, mocks.editUpdate, mocks.removeUpdate, mocks.saveAnswer, mocks.removeQuestion]) fn.mockRejectedValue(new Error("private database detail"));
    const results = await Promise.all([createHostUpdate(id, update), editHostUpdate(id, update), deleteHostUpdate(id, true), answerGuestQuestion(id, { answer: "Yes", isPublished: true }), deleteGuestQuestion(id, true)]);
    for (const result of results) { expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("private database detail"); }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database detail");
    log.mockRestore();
  });
});
