import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
  });
});
