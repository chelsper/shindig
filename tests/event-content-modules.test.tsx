import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../app/event/interaction-actions", () => ({ loadGuestInteractions: vi.fn(), applaudSong: vi.fn(), voteInPoll: vi.fn() }));
import { describe, expect, it, vi } from "vitest";
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));
vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/admin/questions/actions", () => ({ answerGuestQuestion: vi.fn(), deleteGuestQuestion: vi.fn() }));
vi.mock("../app/admin/updates/actions", () => ({ createHostUpdate: vi.fn(), editHostUpdate: vi.fn(), deleteHostUpdate: vi.fn() }));

import { QuestionsModule } from "../components/event-hub/questions-module";
import { UpdatesModule } from "../components/event-hub/updates-module";
import { EventModules } from "../components/event-hub/event-modules";
import { HostQuestionsManager } from "../components/admin/host-questions-manager";
import { HostUpdatesManager } from "../components/admin/host-updates-manager";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

describe("event content presentation", () => {
  it("renders only public question and answer fields, escaped as text", () => {
    const data = { question: "<script>bad</script>", answer: "Bring a chair", guestName: "Private Guest", id: "secret-id", createdAt: "private-time" };
    const html = renderToStaticMarkup(<QuestionsModule questions={[data]} />);
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(html).toContain("Bring a chair");
    for (const value of ["Private Guest", "secret-id", "private-time", "<script>"]) expect(html).not.toContain(value);
    expect(html).toContain("<details");
  });
  it("renders optional update headings and publication times", () => {
    const html = renderToStaticMarkup(<UpdatesModule updates={[{ heading: null, message: "One note", publishedAt: "2026-10-01T20:00:00Z" }, { heading: "Parking", message: "<b>Plain text</b>", publishedAt: "2026-09-01T20:00:00Z" }]} />);
    expect(html.match(/<h3/g)).toHaveLength(1);
    expect(html).toContain("Parking");
    expect(html).toContain('dateTime="2026-10-01T20:00:00Z"');
    expect(html).toContain("&lt;b&gt;Plain text&lt;/b&gt;");
  });
  it("provides friendly empty and unavailable states without false success", () => {
    expect(renderToStaticMarkup(<UpdatesModule updates={[]} />)).toContain("All quiet for now");
    expect(renderToStaticMarkup(<QuestionsModule questions={[]} />)).toContain("Good questions deserve good answers");
    const unavailable = renderToStaticMarkup(<QuestionsModule questions={[]} unavailable />);
    expect(unavailable).toContain('disabled=""');
    expect(unavailable).toContain("Questions are taking a quick break");
    expect(unavailable).not.toContain("Question sent!");
  });
  it("removes both disabled modules and their content entirely", () => {
    const html = renderToStaticMarkup(<EventModules features={{ ...OYSTER_ROAST_EVENT.features, questions: false, updates: false }} guestList={null} questions={[{ question: "Hidden question", answer: "Hidden answer" }]} updates={[{ heading: "Hidden heading", message: "Hidden message", publishedAt: "2026-10-01T20:00:00Z" }]} />);
    for (const value of ["Ask the Host", "Host Updates", "hub-tab-questions", "hub-panel-updates", "Hidden question", "Hidden answer", "Hidden heading", "Hidden message"]) expect(html).not.toContain(value);
  });
  it("shows private submitter information only in the host UI and defaults to unpublished", () => {
    const html = renderToStaticMarkup(<HostQuestionsManager questions={[{ id: "private-id", question: "Chairs?", guestName: "Private Guest", answer: null, isPublished: false, createdAt: "2026-10-01T20:00:00Z" }]} />);
    expect(html).toContain("Private Guest");
    expect(html).toContain("Name visible only to you");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(html).toContain("Uncheck and save to unpublish");
  });
  it("offers a host-only update form and edit/delete controls", () => {
    const html = renderToStaticMarkup(<HostUpdatesManager updates={[{ id: "host-id", heading: null, message: "Hello", publishedAt: "2026-10-01T20:00:00Z" }]} />);
    for (const value of ["Heading (optional)", "Publish update", "Edit", "Delete", "Hello"]) expect(html).toContain(value);
  });
});
