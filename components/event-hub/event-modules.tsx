import type { EventFeatures } from "../../lib/oyster-roast-event";
import type { PublicGuestList } from "../../lib/server/rsvps";
import { GuestListModule } from "./guest-list-module";
import { HubNavigation, type HubModule } from "./hub-navigation";
import { WeatherModule } from "./weather-module";

type EventModulesProps = {
  features: EventFeatures;
  guestList: PublicGuestList | null;
  guestListUnavailable?: boolean;
};

type ModuleDefinition = Omit<HubModule, "content"> & {
  render: (props: EventModulesProps) => HubModule["content"];
};

// Register only implemented modules. Availability stays in the event config;
// navigation and panels are derived from this same list, so they cannot drift.
const moduleRegistry: ModuleDefinition[] = [
  {
    id: "guestList",
    label: "Who’s Coming",
    icon: "guests",
    render: ({ guestList, guestListUnavailable }) => (
      <GuestListModule guestList={guestList} unavailable={guestListUnavailable} />
    ),
  },
  {
    id: "weather",
    label: "Weather",
    icon: "weather",
    render: () => <WeatherModule />,
  },
];

export function EventModules(props: EventModulesProps) {
  const modules = moduleRegistry
    .filter((module) => props.features[module.id])
    .map(({ render, ...module }) => ({ ...module, content: render(props) }));

  return <HubNavigation modules={modules} />;
}
