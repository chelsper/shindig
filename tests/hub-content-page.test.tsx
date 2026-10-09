import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), data: vi.fn(), potluck: vi.fn(), polls: vi.fn(), updates: vi.fn(), questions: vi.fn() }));
vi.mock("../lib/server/host-access", () => ({ isHostAuthenticated: mocks.auth }));
vi.mock("../lib/server/host-hub-content", () => ({ getHostHubContentEvent: mocks.data }));
vi.mock("../lib/server/potluck", () => ({ listHostPotluckItems: mocks.potluck }));
vi.mock("../lib/server/polls", () => ({ listPollsForAdmin: mocks.polls }));
vi.mock("../lib/server/updates", () => ({ listHostUpdatesForAdmin: mocks.updates }));
vi.mock("../lib/server/questions", () => ({ listQuestionsForAdmin: mocks.questions }));
vi.mock("next/navigation", () => ({ redirect: () => { throw Error("redirect"); }, notFound: () => { throw Error("not found"); } }));
vi.mock("../app/admin/potluck/actions", () => ({ savePotluckItem: vi.fn(), releasePotluckSignup: vi.fn() }));
vi.mock("../app/admin/polls/actions", () => ({ saveHostPoll: vi.fn(), setHostPollStatus: vi.fn() }));
vi.mock("../app/admin/updates/actions", () => ({ createHostUpdate: vi.fn(), editHostUpdate: vi.fn(), deleteHostUpdate: vi.fn() }));
vi.mock("../app/admin/questions/actions", () => ({ answerGuestQuestion: vi.fn(), deleteGuestQuestion: vi.fn() }));
import Page, { metadata, dynamic } from "../app/admin/events/[id]/content/page";
import { draft, snapshot, publication } from "./fixtures/publication";
import { adminPoll } from "./fixtures/polls";
const settings = { ...snapshot.settings, features: { ...snapshot.settings.features, potluck: true, polls: true } };
const data = { draft, settings: { settings, revision: 1 }, publication: null, scope: { slug: `event-${draft.id}` }, slug: `event-${draft.id}` };
const context = (view?: string) => ({ params: Promise.resolve({ id: draft.id }), searchParams: Promise.resolve({ view }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue(true); mocks.data.mockResolvedValue(data);
  for (const list of [mocks.potluck, mocks.polls, mocks.updates, mocks.questions]) list.mockResolvedValue([]);
});
describe("Hub Content setup page", () => {
  it.each([
    ["potluck", "+ Add something to bring"], ["polls", "+ Create poll"],
    ["updates", "Save update"], ["questions", "No questions yet"],
  ])("shows the %s editor before the event has ever been published", async (view, label) => {
    const html = renderToStaticMarkup(await Page(context(view)));
    expect(html).toContain(label); expect(html).toContain("This section is private");
    expect(html).toContain("Saving here does not publish the event");
    expect(html).toContain('aria-label="Hub content sections"'); expect(html).toContain("grid-cols-2");
    expect(html).toContain(`/admin/events/${draft.id}/settings#hub-settings-heading`);
    expect(html).toContain("Back to event setup"); expect(html).not.toContain("Manage guest responses");
    expect(mocks[view as "potluck" | "polls" | "updates" | "questions"]).toHaveBeenCalledTimes(1);
    expect(dynamic).toBe("force-dynamic"); expect(metadata.robots.index).toBe(false); expect(metadata.referrer).toBe("no-referrer");
  });
  it("shows the published feature state instead of misleadingly trusting unpublished switches", async () => {
    mocks.data.mockResolvedValue({ ...data, settings: { ...data.settings, settings: { ...settings, features: { ...settings.features, updates: false } } }, publication: { ...publication, snapshot: { ...snapshot, settings } } });
    const html = renderToStaticMarkup(await Page(context("updates")));
    expect(html).toContain("This section is live"); expect(html).toContain("affect the live Hub immediately");
    expect(html).toContain("Publish update"); expect(html).toContain("off in your saved setup"); expect(html).toContain("Manage guest responses");
  });
  it("keeps disabled and archived content manageable but correctly labeled private", async () => {
    mocks.data.mockResolvedValue({ ...data, publication: { ...publication, visibility: "archived" } });
    mocks.polls.mockResolvedValue([{ ...adminPoll, status: "OPEN" }]);
    const html = renderToStaticMarkup(await Page(context("polls")));
    expect(html).toContain("This section is private"); expect(html).toContain("Ready when live");
    expect(html).not.toContain("This section is live");
  });
  it("requires authentication and ownership before any module read", async () => {
    mocks.auth.mockResolvedValue(false); await expect(Page(context())).rejects.toThrow("redirect");
    expect(mocks.data).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue(true); mocks.data.mockResolvedValue(null);
    await expect(Page(context())).rejects.toThrow("not found");
    for (const list of [mocks.potluck, mocks.polls, mocks.updates, mocks.questions]) expect(list).not.toHaveBeenCalled();
  });
  it("contains failures without exposing private database details, and rejects arbitrary views", async () => {
    mocks.potluck.mockRejectedValue(Error("postgresql://secret"));
    const html = renderToStaticMarkup(await Page(context("untrusted")));
    expect(html).toContain("This section couldn’t load"); expect(html).not.toContain("secret");
    expect(mocks.questions).not.toHaveBeenCalled();
    mocks.data.mockRejectedValue(Error("private storage detail"));
    const failed = renderToStaticMarkup(await Page(context()));
    expect(failed).toContain("Hub content couldn’t load"); expect(failed).not.toContain("private storage detail");
  });
});
