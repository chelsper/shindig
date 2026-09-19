import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../app/event/interaction-actions", () => ({ loadGuestInteractions: vi.fn(), applaudSong: vi.fn(), voteInPoll: vi.fn() }));
vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));
vi.mock("../app/admin/polls/actions", () => ({ saveHostPoll: vi.fn(), setHostPollStatus: vi.fn() }));
import { PollsModule } from "../components/event-hub/polls-module";
import { PollResults } from "../components/event-hub/poll-results";
import { EventModules } from "../components/event-hub/event-modules";
import { PollEditor } from "../components/admin/poll-editor";
import { HostPollsManager } from "../components/admin/host-polls-manager";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { adminPoll, pollOptions, pollResults, publicPoll } from "./fixtures/polls";

describe("poll presentation", () => {
  it("has no empty public module or navigation", () => {
    expect(renderToStaticMarkup(<PollsModule polls={[]} />)).toBe("");
    expect(renderToStaticMarkup(<EventModules features={OYSTER_ROAST_EVENT.features} guestList={null} polls={[]} />)).not.toContain('id="hub-tab-polls"');
  });
  it("respects the feature flag for both navigation and content", () => {
    const props = { features: OYSTER_ROAST_EVENT.features, guestList: null, polls: [publicPoll] };
    expect(renderToStaticMarkup(<EventModules {...props} />)).toContain('id="hub-tab-polls"');
    const disabled = renderToStaticMarkup(<EventModules {...props} features={{ ...props.features, polls: false }} />);
    expect(disabled).not.toContain('id="hub-tab-polls"');
    expect(disabled).not.toContain(publicPoll.question);
  });
  it("renders one question at a time with compact multiple-poll navigation", () => {
    const html = renderToStaticMarkup(<PollsModule polls={[publicPoll, { ...publicPoll, key: "second", question: "Second question?" }]} />);
    expect(html).toContain("1 of 2");
    expect(html).toContain("Next");
    expect(html).toContain(publicPoll.question);
    expect(html).not.toContain("Second question?");
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).not.toContain("Poll results");
  });
  it("uses checkboxes for multiple choice and never offers voting on closed polls", () => {
    expect(renderToStaticMarkup(<PollsModule polls={[{ ...publicPoll, allowMultiple: true }]} />).match(/type="checkbox"/g)).toHaveLength(4);
    const closed = renderToStaticMarkup(<PollsModule polls={[{ ...publicPoll, status: "CLOSED", results: pollResults }]} />);
    expect(closed).toContain("Final results");
    expect(closed).toContain("30 highly scientific responses");
    expect(closed).not.toContain("<form");
  });
  it("shows correct rounded percentages and explains multiple-choice denominators", () => {
    const html = renderToStaticMarkup(<PollResults options={pollOptions} results={pollResults} multiple admin />);
    for (const value of ["14 · 47%", "8 · 27%", "5 · 17%", "3 · 10%"]) expect(html).toContain(value);
    expect(html).toContain("totals can exceed 100%");
  });
  it("keeps admin controls available without polls and locks voted option meaning", () => {
    const empty = renderToStaticMarkup(<HostPollsManager polls={[]} />);
    expect(empty).toContain("Create poll");
    expect(empty).toContain("guests won’t see it until you open it");
    const editor = renderToStaticMarkup(<PollEditor poll={{ ...adminPoll, votingStarted: true }} onSaved={() => {}} onCancel={() => {}} />);
    expect(editor.match(/readOnly=""/g)).toHaveLength(4);
    expect(editor).not.toContain("Add option");
    expect(editor).not.toContain("Remove option");
    expect(editor).toContain("Move option 2 up");
  });
});
