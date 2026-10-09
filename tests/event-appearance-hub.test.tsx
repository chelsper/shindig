import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/rsvps", () => ({ getPublicGuestList: vi.fn(async () => ({ totalGuestCount: 6, guests: [{ guestName: "Visible household", partySize: 2 }] })) }));
vi.mock("../lib/server/playlist", () => ({ listPublicPlaylistSuggestions: async () => [] }));
vi.mock("../lib/server/questions", () => ({ listPublicQuestions: async () => [] }));
vi.mock("../lib/server/updates", () => ({ listPublicHostUpdates: async () => [] }));
vi.mock("../lib/server/polls", () => ({ listPublicPolls: async () => [] }));
vi.mock("../components/event-hub/playlist-module", () => ({ PlaylistModule: () => null }));
vi.mock("../components/event-hub/questions-module", () => ({ QuestionsModule: () => null }));
vi.mock("../components/event-hub/polls-module", () => ({ PollsModule: () => null }));
vi.mock("../components/guest-interactions-provider", () => ({ GuestInteractionsProvider: ({ children }: { children: React.ReactNode }) => children }));
import { PublishedEventHub } from "../components/event-hub/published-event-hub";
import { getPublicGuestList } from "../lib/server/rsvps";
import { publicationEvent } from "../lib/event-publication";
import { snapshot, eventId } from "./fixtures/publication";
import type { EventScope } from "../lib/server/event-scope";
const event = publicationEvent(eventId, { ...snapshot, artwork: { ...snapshot.artwork, design: { style: "after-dark", invitationCrop: { x: 50, y: 50, zoom: 100 } } } });
const scope = { slug: event.slug } as EventScope;
describe("published Hub design keeps the existing public boundary", () => {
  it("uses scoped guest projection, event-specific actions and the reviewed style", async () => {
    const html = renderToStaticMarkup(await PublishedEventHub({ event, scope }));
    expect(getPublicGuestList).toHaveBeenCalledWith(scope);
    expect(html).toContain('data-event-design="after-dark"'); expect(html).toContain("6"); expect(html).toContain("Visible");
    expect(html).toContain("Around the Shindig"); expect(html).not.toContain("Around the Roast");
    expect(html).toContain(`${event.websiteUrl}`); expect(html).toContain(`/e/${event.slug}/calendar.ics`);
    expect(html).toContain("Get Directions"); expect(html).toContain("Return to invitation");
    expect(html).not.toMatch(/event-drafts\/|\/admin\/|owner_host|DATABASE_URL/);
  });
  it("does not break the styled Hub if guest data fails", async () => {
    vi.mocked(getPublicGuestList).mockRejectedValueOnce(new Error("private-db-detail"));
    const html = renderToStaticMarkup(await PublishedEventHub({ event, scope }));
    expect(html).toContain("taking a quick break"); expect(html).toContain('data-event-design="after-dark"'); expect(html).not.toContain("private-db-detail");
  });
  it("keeps the original presentation for publications without an explicit design", async () => {
    const original = publicationEvent(eventId, snapshot);
    const html = renderToStaticMarkup(await PublishedEventHub({ event: original, scope }));
    expect(html).not.toContain("data-event-design"); expect(html).toContain("Garden Supper");
  });
});
