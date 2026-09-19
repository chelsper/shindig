import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), remove: vi.fn(), listAdmin: vi.fn(), authenticated: vi.fn(), revalidatePath: vi.fn(),
  redirect: vi.fn(), event: { slug: "oyster-roast-2026", eventHub: { path: "/event" }, features: { playlist: true } },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../lib/oyster-roast-event", () => ({ OYSTER_ROAST_EVENT: mocks.event }));
vi.mock("../lib/server/admin-session", () => ({ isAdminAuthenticated: mocks.authenticated }));
vi.mock("../lib/server/playlist", () => ({
  createPlaylistSuggestion: mocks.create, deletePlaylistSuggestion: mocks.remove, listPlaylistSuggestionsForAdmin: mocks.listAdmin,
}));

import { submitPlaylistSuggestion } from "../app/event/playlist-actions";
import { deleteAdminPlaylistSuggestion } from "../app/admin/playlist/actions";
import AdminPlaylistPage from "../app/admin/playlist/page";

const id = "4f849d18-931b-42ef-a4d4-7ec07aa73b3d";
const suggestion = { songTitle: "Lovely Day", artist: "Bill Withers", suggestedBy: null };
function confirmation() { const data = new FormData(); data.set("confirm", "delete"); return data; }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.event.features.playlist = true;
  mocks.authenticated.mockResolvedValue(true);
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

describe("public playlist action", () => {
  it.each(["added", "duplicate"])("returns %s and refreshes the list without IDs or timestamps", async (outcome) => {
    mocks.create.mockResolvedValue(outcome);
    await expect(submitPlaylistSuggestion(suggestion)).resolves.toEqual({ ok: true, outcome });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/playlist");
  });

  it("rejects writes when the feature is disabled", async () => {
    mocks.event.features.playlist = false;
    expect((await submitPlaylistSuggestion(suggestion)).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input before calling the database", async () => {
    expect((await submitPlaylistSuggestion({ ...suggestion, artist: "" })).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not expose database details or show success on failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockRejectedValue(new Error("postgresql://secret credentials"));
    const result = await submitPlaylistSuggestion(suggestion);
    expect(result).toEqual({ ok: false, message: "We couldn’t add your song. Please try again in a moment." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret credentials");
    log.mockRestore();
  });
});

describe("host playlist moderation", () => {
  it("denies both retrieval and deletion without the existing admin session", async () => {
    mocks.authenticated.mockResolvedValue(false);
    await expect(AdminPlaylistPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listAdmin).not.toHaveBeenCalled();
    expect(await deleteAdminPlaylistSuggestion(id, { error: null }, confirmation())).toMatchObject({ error: expect.any(String) });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("requires a valid ID and explicit deletion confirmation", async () => {
    expect(await deleteAdminPlaylistSuggestion("invalid", { error: null }, confirmation())).toMatchObject({ error: expect.any(String) });
    expect(await deleteAdminPlaylistSuggestion(id, { error: null }, new FormData())).toMatchObject({ error: expect.any(String) });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes a confirmed suggestion and refreshes public and private pages", async () => {
    mocks.remove.mockResolvedValue(true);
    await expect(deleteAdminPlaylistSuggestion(id, { error: null }, confirmation())).resolves.toEqual({ error: null });
    expect(mocks.remove).toHaveBeenCalledWith(id);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/playlist");
  });

  it("returns a friendly retry error if deletion fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.remove.mockRejectedValue(new Error("private database detail"));
    await expect(deleteAdminPlaylistSuggestion(id, { error: null }, confirmation())).resolves.toEqual({ error: "We couldn’t delete that suggestion. Please try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
