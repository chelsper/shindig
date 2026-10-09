import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../app/event/potluck-actions", () => ({ saveGuestPotluckClaim: vi.fn() }));
vi.mock("../app/admin/potluck/actions", () => ({ savePotluckItem: vi.fn(), releasePotluckSignup: vi.fn() }));
vi.mock("../app/event/interaction-actions", () => ({ loadGuestInteractions: vi.fn(), applaudSong: vi.fn(), voteInPoll: vi.fn() }));
vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));
import { validatePotluckClaim, validatePotluckItem } from "../lib/potluck";
import { PotluckModule } from "../components/event-hub/potluck-module";
import { EventModules } from "../components/event-hub/event-modules";
import { HostPotluckManager } from "../components/admin/host-potluck-manager";
import { PotluckClaimEditor } from "../components/potluck/claim-editor";
import { publicationEvent } from "../lib/event-publication";
import { eventId, snapshot } from "./fixtures/publication";
import config from "../next.config";
const key = "5199b7de-d731-4bb1-8e55-3380e2f0e365", token = "a".repeat(43);
const item = { key, title: "Bags of ice", note: "Ten-pound bags", needed: 5, claimed: 2 };
const claim = { itemKey: key, editToken: token, guestName: " Alex ", quantity: 2, revision: 0 };
const event = publicationEvent(eventId, { ...snapshot, settings: { ...snapshot.settings, features: { ...snapshot.settings.features, potluck: true } } });

describe("bring-something validation and presentation", () => {
  it("trims names and item copy and accepts valid bounds", () => {
    expect(validatePotluckClaim(claim)).toMatchObject({ ok: true, data: { guestName: "Alex" } });
    expect(validatePotluckItem({ ...item, title: " Ice ", note: " Chilled\nplease ", archived: false, revision: 0 })).toMatchObject({ ok: true, data: { title: "Ice", note: "Chilled\nplease" } });
    for (const quantity of [1, 20]) expect(validatePotluckClaim({ ...claim, quantity }).ok).toBe(true);
    expect(validatePotluckClaim({ ...claim, quantity: "invalid", guestName: null }, true)).toMatchObject({ ok: true, data: { quantity: 0, guestName: "" } });
  });
  it.each([null, [], {}, { ...claim, guestName: " " }, { ...claim, guestName: "x".repeat(121) }, { ...claim, guestName: "Alex\nAnother" }, { ...claim, quantity: 0 }, { ...claim, quantity: 21 }, { ...claim, quantity: 1.5 }, { ...claim, quantity: "2" }, { ...claim, quantity: Infinity }, { ...claim, revision: -1 }, { ...claim, itemKey: "1" }, { ...claim, editToken: key }])("rejects malformed claims: %j", input => {
    expect(validatePotluckClaim(input).ok).toBe(false);
  });
  it.each([{ title: " " }, { title: "x".repeat(101) }, { note: "x".repeat(501) }, { note: "\u0000" }, { needed: 0 }, { needed: 101 }, { needed: 1.5 }, { archived: "false" }, { revision: "0" }])("rejects malformed host items: %j", patch => {
    expect(validatePotluckItem({ ...item, archived: false, revision: 0, ...patch }).ok).toBe(false);
  });
  it("shows counts, notes, covered items and friendly empty/unavailable states", () => {
    const html = renderToStaticMarkup(<PotluckModule items={[item, { ...item, key: "another", title: "Lemons", claimed: 5 }]} eventSlug={event.slug} />);
    expect(html).toContain("3 still needed · 2 of 5 covered"); expect(html).toContain("All covered"); expect(html).toContain("Ten-pound bags");
    expect(html).not.toContain("guestName"); expect(html).not.toContain("<form");
    expect(renderToStaticMarkup(<PotluckModule items={[]} eventSlug={event.slug} />)).toContain("Nothing needed just yet");
    expect(renderToStaticMarkup(<PotluckModule items={[item]} eventSlug={event.slug} unavailable />)).not.toContain("Bags of ice");
  });
  it("removes the complete module and navigation when disabled", () => {
    const props = { event, features: event.features, guestList: null, potluckItems: [item] };
    expect(renderToStaticMarkup(<EventModules {...props} />)).toContain('id="hub-tab-potluck"');
    const disabled = renderToStaticMarkup(<EventModules {...props} features={{ ...event.features, potluck: false }} />);
    expect(disabled).not.toContain("hub-tab-potluck"); expect(disabled).not.toContain("Bags of ice");
  });
  it("keeps host names in the host manager and offers closed-item cancellation only", () => {
    const host = renderToStaticMarkup(<HostPotluckManager initial={[{ ...item, revision: 1, archived: false, claims: [{ id: key, guestName: "Private Alex", quantity: 2 }] }]} />);
    expect(host).toContain("Private Alex"); expect(host).toContain("Close item");
    const html = renderToStaticMarkup(<PotluckClaimEditor event={event} token={token} initial={{ itemKey: key, title: item.title, guestName: "Private Alex", quantity: 2, revision: 1, archived: true }} />);
    expect(html).toContain("Cancel my signup"); expect(html).not.toContain("<form"); expect(html).toContain(event.eventHub.path);
  });
  it("protects private-link responses against referrer leaks, indexing and caching", async () => {
    const headers = await config.headers!();
    expect(headers).toContainEqual({ source: "/e/:slug/bring/:token", headers: expect.arrayContaining([
      { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store, max-age=0" },
    ]) });
  });
});
