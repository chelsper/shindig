import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ pub: vi.fn(), auth: vi.fn(), song: vi.fn(), question: vi.fn(), applause: vi.fn(), answer: vi.fn(), remove: vi.fn(), update: vi.fn(), poll: vi.fn(), status: vi.fn(), revalidate: vi.fn(), track: vi.fn() }));
vi.mock("../lib/server/event-publications", () => ({ getEventPublication: mocks.pub, getHostEventPublication: mocks.pub }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.auth }));
vi.mock("../lib/server/playlist", () => ({ createPlaylistSuggestion: mocks.song, deletePlaylistSuggestion: mocks.remove }));
vi.mock("../lib/server/questions", () => ({ insertGuestQuestion: mocks.question, saveQuestionAnswer: mocks.answer, removeQuestion: mocks.remove }));
vi.mock("../lib/server/updates", () => ({ insertHostUpdate: mocks.update, updateHostUpdate: mocks.update, removeHostUpdate: mocks.remove }));
vi.mock("../lib/server/applause", () => ({ setPlaylistApplause: mocks.applause, listGuestApplause: async () => [] }));
vi.mock("../lib/server/polls", () => ({ savePoll: mocks.poll, changePollStatus: mocks.status, listGuestPollStates: async () => ({}), setPollVote: vi.fn() }));
vi.mock("../lib/server/guest-token", () => ({ getGuestTokenHash: async () => "a".repeat(64) }));
vi.mock("../lib/server/music", () => ({ getMusicTrack: mocks.track }));
vi.mock("../lib/server/music/rate-limit", () => ({ throttleMusicRequest: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { submitPlaylistSuggestion } from "../app/event/playlist-actions";
import { submitGuestQuestion } from "../app/event/question-actions";
import { applaudSong } from "../app/event/interaction-actions";
import { answerGuestQuestion, deleteGuestQuestion } from "../app/admin/questions/actions";
import { createHostUpdate } from "../app/admin/updates/actions";
import { saveHostPoll, setHostPollStatus } from "../app/admin/polls/actions";
import { deleteAdminPlaylistSuggestion } from "../app/admin/playlist/actions";
import { publication, snapshot, eventSlug, otherEventId } from "./fixtures/publication";
import { pollInput, pollKey } from "./fixtures/polls";
beforeEach(() => {
  vi.resetAllMocks(); mocks.pub.mockResolvedValue(publication); mocks.auth.mockResolvedValue(true);
  mocks.track.mockResolvedValue({ provider: "spotify", providerTrackId: "4uLU6hMCjMI75M1A2tKUQC", songTitle: "Canonical song", artist: "Canonical artist" });
  mocks.song.mockResolvedValue("added"); mocks.applause.mockResolvedValue(1); mocks.answer.mockResolvedValue(true); mocks.poll.mockResolvedValue(true); mocks.status.mockResolvedValue(true);
});
describe("published guest module actions", () => {
  it("stores canonical tracks, private questions and applause in the resolved event", async () => {
    expect((await submitPlaylistSuggestion({ provider: "spotify", providerTrackId: "4uLU6hMCjMI75M1A2tKUQC", suggestedBy: "Guest" }, eventSlug)).ok).toBe(true);
    expect(mocks.song.mock.lastCall![0].songTitle).toBe("Canonical song"); expect(mocks.song.mock.lastCall![1].slug).toBe(eventSlug);
    expect((await submitGuestQuestion({ question: "Can I bring something?", guestName: "Private Name", requestToken: otherEventId, isPublished: true }, eventSlug)).ok).toBe(true);
    expect(mocks.question.mock.lastCall![1].slug).toBe(eventSlug); expect(mocks.question.mock.lastCall![0]).not.toHaveProperty("isPublished");
    expect((await applaudSong(pollKey, true, eventSlug)).ok).toBe(true); expect(mocks.applause.mock.lastCall![3].slug).toBe(eventSlug);
    expect(mocks.revalidate.mock.calls.flat()).toContain(`/e/${eventSlug}/event`);
  });
  it("rejects all guest writes for unpublished events and disabled modules", async () => {
    for (const pub of [null, { ...publication, snapshot: { ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, playlist: false, questions: false } } } }]) {
      mocks.pub.mockResolvedValue(pub);
      expect((await submitPlaylistSuggestion({ provider: "spotify", providerTrackId: "4uLU6hMCjMI75M1A2tKUQC" }, eventSlug)).ok).toBe(false);
      expect((await submitGuestQuestion({ question: "Question?", requestToken: otherEventId }, eventSlug)).ok).toBe(false);
      expect((await applaudSong(pollKey, true, eventSlug)).ok).toBe(false);
    }
    for (const fn of [mocks.song, mocks.track, mocks.question, mocks.applause]) expect(fn).not.toHaveBeenCalled();
  });
});
describe("published host moderation", () => {
  const deletion = new FormData(); deletion.set("confirm", "delete");
  it("uses this event for answers, updates, poll management and deletion", async () => {
    expect((await answerGuestQuestion(otherEventId, { answer: "Sure!", isPublished: true }, eventSlug)).ok).toBe(true);
    expect(mocks.answer.mock.lastCall![2].slug).toBe(eventSlug);
    expect((await createHostUpdate(otherEventId, { heading: "Hello", message: "A little note." }, eventSlug)).ok).toBe(true);
    expect(mocks.update.mock.lastCall![2].slug).toBe(eventSlug);
    expect((await saveHostPoll(pollKey, pollInput, true, eventSlug)).ok).toBe(true); expect(mocks.poll.mock.lastCall![3].slug).toBe(eventSlug);
    expect((await setHostPollStatus(pollKey, "OPEN", false, eventSlug)).ok).toBe(true); expect(mocks.status.mock.lastCall![2].slug).toBe(eventSlug);
    expect((await deleteGuestQuestion(otherEventId, true, eventSlug)).ok).toBe(true); expect(mocks.remove.mock.lastCall![1].slug).toBe(eventSlug);
    expect(await deleteAdminPlaylistSuggestion(otherEventId, { error: null }, deletion, eventSlug)).toEqual({ error: null }); expect(mocks.remove.mock.lastCall![1].slug).toBe(eventSlug);
  });
  it("keeps content moderation available to hosts while the event is unpublished", async () => {
    mocks.pub.mockResolvedValue({ ...publication, visibility: "unpublished", rsvpsOpen: false });
    expect((await answerGuestQuestion(otherEventId, { answer: "Saved privately", isPublished: false }, eventSlug)).ok).toBe(true);
    expect(mocks.answer.mock.lastCall![2]).toMatchObject({ slug: eventSlug, access: "host" });
    expect((await createHostUpdate(otherEventId, { message: "Ready for later." }, eventSlug)).ok).toBe(true);
    expect(mocks.update.mock.lastCall![2]).toMatchObject({ slug: eventSlug, access: "host" });
  });
  it("requires host authentication before resolving events or mutating any module", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await answerGuestQuestion(otherEventId, { answer: "Sure!", isPublished: true }, eventSlug)).ok).toBe(false);
    expect((await createHostUpdate(otherEventId, { message: "Hello" }, eventSlug)).ok).toBe(false);
    expect((await saveHostPoll(pollKey, pollInput, true, eventSlug)).ok).toBe(false);
    expect((await deleteAdminPlaylistSuggestion(otherEventId, { error: null }, deletion, eventSlug)).error).toBeTruthy();
    for (const fn of [mocks.pub, mocks.answer, mocks.update, mocks.poll, mocks.remove]) expect(fn).not.toHaveBeenCalled();
  });
  it("cannot use an unknown slug to fall back to the legacy event", async () => {
    mocks.pub.mockResolvedValue(null);
    expect((await answerGuestQuestion(otherEventId, { answer: "Sure!", isPublished: true }, eventSlug)).ok).toBe(false);
    expect(mocks.answer).not.toHaveBeenCalled();
  });
});
