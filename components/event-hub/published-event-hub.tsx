import type { EventConfiguration } from "../../lib/oyster-roast-event";
import type { EventScope } from "../../lib/server/event-scope";
import { getPublicGuestList } from "../../lib/server/rsvps";
import { listPublicPlaylistSuggestions } from "../../lib/server/playlist";
import { listPublicQuestions } from "../../lib/server/questions";
import { listPublicHostUpdates } from "../../lib/server/updates";
import { listPublicPolls } from "../../lib/server/polls";
import { EventHubHeader } from "./event-hub-header";
import { EventModules } from "./event-modules";

export async function PublishedEventHub({ event, scope }: { event: EventConfiguration; scope: EventScope }) {
  const [guests, playlist, questions, updates, polls] = await Promise.allSettled([
    getPublicGuestList(scope), listPublicPlaylistSuggestions(scope), listPublicQuestions(scope), listPublicHostUpdates(scope), listPublicPolls(scope),
  ]);
  const image = event.eventHub.headerImage;
  return <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-5 text-[#202523] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
    <div aria-hidden="true" className="page-texture" /><div className="relative mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between gap-4 px-1"><p className="font-serif text-2xl">Shindig</p><p className="text-xs text-[#202523]/65">{event.cityLabel}</p></div>
      <EventHubHeader event={event} headerSettings={{ imageUrl: image.url, imageAlt: image.alt, focalX: image.focalX, focalY: image.focalY, zoomPercent: image.zoomPercent }} />
      <EventModules event={event} features={event.features}
        guestList={guests.status === "fulfilled" ? guests.value : null} guestListUnavailable={guests.status === "rejected"}
        playlistSuggestions={playlist.status === "fulfilled" ? playlist.value : []} playlistUnavailable={playlist.status === "rejected"}
        questions={questions.status === "fulfilled" ? questions.value : []} questionsUnavailable={questions.status === "rejected"}
        updates={updates.status === "fulfilled" ? updates.value : []} updatesUnavailable={updates.status === "rejected"}
        polls={polls.status === "fulfilled" ? polls.value : []} />
      <footer className="mt-8 border-t border-[#202523]/12 py-5 text-center text-xs text-[#202523]/50">Good people. Great gatherings.</footer>
    </div>
  </main>;
}
