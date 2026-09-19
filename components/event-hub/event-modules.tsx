import type { EventFeatures } from "../../lib/oyster-roast-event";
import type { PublicPlaylistSuggestion } from "../../lib/playlist";
import type { PublicQuestion } from "../../lib/questions";
import type { PublicHostUpdate } from "../../lib/updates";
import type { PublicGuestList } from "../../lib/server/rsvps";
import { GuestListModule } from "./guest-list-module";
import { HubNavigation, type HubModule } from "./hub-navigation";
import { WeatherModule } from "./weather-module";
import { PlaylistModule } from "./playlist-module";
import { QuestionsModule } from "./questions-module";
import { UpdatesModule } from "./updates-module";
import { PollsModule } from "./polls-module";
import type { PublicPoll } from "../../lib/polls";
import { GuestInteractionsProvider } from "../guest-interactions-provider";

type EventModulesProps = {
  features: EventFeatures;
  guestList: PublicGuestList | null;
  guestListUnavailable?: boolean;
  playlistSuggestions?: PublicPlaylistSuggestion[];
  playlistUnavailable?: boolean;
  questions?: PublicQuestion[];
  questionsUnavailable?: boolean;
  updates?: PublicHostUpdate[];
  updatesUnavailable?: boolean;
  polls?: PublicPoll[];
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
    id: "playlist",
    label: "Playlist",
    icon: "playlist",
    render: ({ playlistSuggestions = [], playlistUnavailable }) => (
      <PlaylistModule suggestions={playlistSuggestions} unavailable={playlistUnavailable} />
    ),
  },
  {
    id: "questions",
    label: "Ask the Host",
    icon: "questions",
    render: ({ questions = [], questionsUnavailable }) => (
      <QuestionsModule questions={questions} unavailable={questionsUnavailable} />
    ),
  },
  {
    id: "polls", label: "Important Research", icon: "polls",
    render: ({ polls = [] }) => <PollsModule polls={polls} />,
  },
  {
    id: "updates",
    label: "Updates",
    icon: "updates",
    render: ({ updates = [], updatesUnavailable }) => (
      <UpdatesModule updates={updates} unavailable={updatesUnavailable} />
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
    .filter((module) => module.id !== "polls" || Boolean(props.polls?.length))
    .map(({ render, ...module }) => ({ ...module, content: render(props) }));

  return <GuestInteractionsProvider enabled={props.features.playlist || (props.features.polls && Boolean(props.polls?.length))}><HubNavigation modules={modules} /></GuestInteractionsProvider>;
}
