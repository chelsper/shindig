import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/event/playlist-actions", () => ({ submitPlaylistSuggestion: vi.fn() }));
vi.mock("../app/event/question-actions", () => ({ submitGuestQuestion: vi.fn() }));

import { EventModules } from "../components/event-hub/event-modules";
import { GuestListModule } from "../components/event-hub/guest-list-module";
import {
  OYSTER_ROAST_EVENT,
  type EventFeatures,
} from "../lib/oyster-roast-event";

const enabledFeatures: EventFeatures = {
  ...OYSTER_ROAST_EVENT.features,
};

describe("Event Hub modules", () => {
  it("gives each enabled module a matching navigation tab and panel", () => {
    const html = renderToStaticMarkup(
      <EventModules features={enabledFeatures} guestList={{ totalGuestCount: 2, guests: [] }} />,
    );

    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(5);
    for (const id of ["guestList", "playlist", "weather", "questions", "updates"]) {
      expect(html).toContain(`aria-controls="hub-panel-${id}"`);
      expect(html).toContain(`id="hub-panel-${id}"`);
      expect(html).toContain(`aria-labelledby="hub-tab-${id}"`);
      expect(html).toContain(`id="hub-tab-${id}"`);
    }
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('hidden="" id="hub-panel-weather"');
    expect(html).toContain("Checking the skies in St. Johns");
  });

  it("hides disabled and unimplemented modules from navigation and content", () => {
    const html = renderToStaticMarkup(
      <EventModules
        features={{ ...enabledFeatures, weather: false, playlist: false, photos: true, questions: false, updates: false }}
        guestList={null}
      />,
    );

    expect(html.match(/role="tab"/g)).toHaveLength(1);
    expect(html).toContain("Who’s Coming");
    for (const text of ["Weather", "Checking the skies", "Playlist", "Photos", "Questions", "Ask the Host", "Updates"]) {
      expect(html).not.toContain(text);
    }
  });

  it("renders nothing when all implemented modules are disabled", () => {
    const html = renderToStaticMarkup(
      <EventModules features={{ ...enabledFeatures, guestList: false, weather: false, playlist: false, questions: false, updates: false }} guestList={null} />,
    );
    expect(html).toBe("");
  });

  it("loads weather independently when guest-list retrieval fails", () => {
    const html = renderToStaticMarkup(
      <EventModules features={enabledFeatures} guestList={null} guestListUnavailable />,
    );
    expect(html).toContain("The guest list is taking a quick break.");
    expect(html).toContain("Checking the skies in St. Johns");
    expect(html).not.toContain("0 guests");
  });

  it("renders visible attending guests and the full attending total", () => {
    const html = renderToStaticMarkup(
      <GuestListModule
        guestList={{
          totalGuestCount: 6,
          guests: [{ guestName: "Visible Household", partySize: 2 }],
        }}
      />,
    );

    expect(html).toContain("Who’s Coming");
    expect(html).toContain("6");
    expect(html).toContain("Visible Household");
    expect(html).toContain("Party of 2");
  });

  it("shows a friendly empty state when no names are public", () => {
    const html = renderToStaticMarkup(
      <GuestListModule guestList={{ totalGuestCount: 3, guests: [] }} />,
    );

    expect(html).toContain("Guests are coming!");
    expect(html).toContain("No one has chosen to appear publicly just yet.");
  });

  it("does not render guest-list UI when the feature is disabled", () => {
    const features: EventFeatures = {
      ...enabledFeatures,
      guestList: false,
      playlist: false,
      questions: false,
      updates: false,
    };
    const html = renderToStaticMarkup(
      <EventModules
        features={features}
        guestList={{
          totalGuestCount: 2,
          guests: [{ guestName: "Should Not Render", partySize: 2 }],
        }}
      />,
    );

    expect(html).not.toContain("Who’s Coming");
    expect(html).not.toContain("Should Not Render");
    expect(html).not.toContain('id="hub-tab-guestList"');
    expect(html).toContain("Checking the skies in St. Johns");
    expect(html).not.toContain('hidden=""');
  });
});
