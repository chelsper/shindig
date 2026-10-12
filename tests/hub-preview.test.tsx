import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedHubPreview } from "../components/admin/saved-hub-preview";
import { HubContentReadiness } from "../components/admin/hub-content-readiness";
import { hubContentReadiness, unavailableHubPreview } from "../lib/event-hub-preview";
import { hubPreview, previewSettings } from "./fixtures/hub-preview";
import { eventId } from "./fixtures/publication";

const render = (content = hubPreview, settings = previewSettings) => renderToStaticMarkup(<SavedHubPreview content={content} settings={settings} timeZone="America/Los_Angeles" />);
describe("saved Hub content preview", () => {
  it("renders actual content, quantities, poll options, notes and approved answers", () => {
    const html = render();
    for (const text of ["Bags of ice", "3 still needed · 1 of 4 covered", "Veggie skewers", "Use the side gate.", "Can I bring a jacket?", "Yes, we’ll be outdoors."]) expect(html).toContain(text);
    expect(html).toContain("Content already live"); expect(html).toContain("Prepared privately");
    expect(html).toContain("Nov 7, 2026, 5:00 PM"); expect(html).not.toContain("Nov 8");
    expect(html).toContain("Read-only preview");
  });
  it("has no guest submit forms, enabled mutation controls or public action links", () => {
    const html = render();
    expect(html).not.toMatch(/<form|action=|href="\/e\/|Submit RSVP/);
    for (const button of ["I’ll bring this", "Vote", "+ Ask a Question"]) expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${button.replace(/[+]/g, "\\+")}`));
    expect(html.match(/<input[^>]*>/g)?.every(input => input.includes('disabled=""'))).toBe(true);
    const source = readFileSync("components/admin/saved-hub-preview.tsx", "utf8");
    expect(source).not.toMatch(/from .*actions|from .*provider|useEffect|fetch\(/);
  });
  it("omits disabled module content and draft-only empty poll navigation", () => {
    const content = { ...hubPreview, polls: { ...hubPreview.polls, items: [] } };
    const html = render(content, { ...previewSettings, features: { ...previewSettings.features, potluck: false, questions: false, updates: false } });
    expect(html).not.toMatch(/Bags of ice|Parking|jacket|hub-tab-polls/);
    expect(html).toContain("ready to display");
  });
  it("shows disabled voting on open polls and final results only on closed polls", () => {
    const closed = { ...hubPreview.polls.items[0], status: "CLOSED" as const, responses: 4, options: [{ text: "Corn", count: 3 }, { text: "Skewers", count: 1 }] };
    const html = render({ ...hubPreview, polls: { ...hubPreview.polls, items: [closed] } });
    expect(html).toContain("75%"); expect(html).toContain("25%"); expect(html).toContain("Final results");
    expect(html).not.toContain(">Vote</button>"); expect(html).toContain("This poll is closed");
  });
  it("never substitutes empty-state copy for unavailable storage", () => {
    const html = render(unavailableHubPreview());
    expect(html).toContain("Saved content couldn’t load"); expect(html).toContain("Live status unavailable");
    expect(html).not.toMatch(/Nothing needed|All quiet|Good questions deserve|Content already live/);
  });
  it("escapes saved text and uses wrap-safe mobile layouts", () => {
    const html = render({ ...hubPreview, potluck: { ...hubPreview.potluck, items: [{ title: "<script>unsafe</script>", note: "<img src=x>", needed: 1, claimed: 1 }] } });
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("All covered"); expect(html).toContain("break-words"); expect(html).toContain("min-w-0");
  });
});
describe("advisory Hub readiness", () => {
  it("provides direct event-specific setup links without blocking publication", () => {
    const empty = { ...hubPreview, potluck: { ...hubPreview.potluck, items: [] }, polls: { ...hubPreview.polls, items: [] }, questions: { ...hubPreview.questions, items: [] } };
    const entries = hubContentReadiness(empty, previewSettings.features);
    expect(entries.find(e => e.id === "questions")?.status).toBe("Ready for questions");
    const html = renderToStaticMarkup(<HubContentReadiness id={eventId} content={empty} features={previewSettings.features} />);
    expect(html).toContain("2 suggestions"); expect(html).toContain("not publishing requirements");
    for (const id of ["potluck", "polls", "updates", "questions"]) expect(html).toContain(`/admin/events/${eventId}/content?view=${id}`);
    expect(html).toContain("Already live"); expect(html).toContain("Private until publication");
  });
  it("does not show disabled-section advice and distinguishes unavailable from empty", () => {
    const features = { ...previewSettings.features, polls: false, updates: false, questions: false };
    expect(hubContentReadiness(unavailableHubPreview(), features)).toEqual([expect.objectContaining({ id: "potluck", status: "Couldn’t check" })]);
    expect(hubContentReadiness(hubPreview, { ...features, potluck: false })).toEqual([]);
  });
});
