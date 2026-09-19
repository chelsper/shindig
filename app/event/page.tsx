import type { Metadata } from "next";

import { EventHubHeader } from "../../components/event-hub/event-hub-header";
import { EventModules } from "../../components/event-hub/event-modules";
import { DEFAULT_EVENT_HUB_HEADER } from "../../lib/event-hub-settings";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { getEventHubHeaderSettings } from "../../lib/server/event-hub-settings";
import {
  getPublicGuestList,
  type PublicGuestList,
} from "../../lib/server/rsvps";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${OYSTER_ROAST_EVENT.title} · Event Hub`,
  description: `${OYSTER_ROAST_EVENT.dateLabel} at ${OYSTER_ROAST_EVENT.timeLabel} in ${OYSTER_ROAST_EVENT.cityLabel}.`,
};

export default async function EventPage() {
  let headerSettings = DEFAULT_EVENT_HUB_HEADER;
  let guestList: PublicGuestList | null = null;
  let guestListUnavailable = false;

  if (!process.env.DATABASE_URL?.trim()) {
    if (OYSTER_ROAST_EVENT.features.guestList) {
      guestListUnavailable = true;
    }
  } else {
    try {
      headerSettings = await getEventHubHeaderSettings();
    } catch (error) {
      const databaseError =
        error && typeof error === "object"
          ? (error as { code?: string; name?: string })
          : {};
      console.error("Event Hub header retrieval failed.", {
        code: databaseError.code ?? "unknown",
        name: databaseError.name ?? "unknown",
      });
    }

    if (OYSTER_ROAST_EVENT.features.guestList) {
      try {
        guestList = await getPublicGuestList();
      } catch (error) {
        const databaseError =
          error && typeof error === "object"
            ? (error as { code?: string; name?: string })
            : {};
        console.error("Public guest list retrieval failed.", {
          code: databaseError.code ?? "unknown",
          name: databaseError.name ?? "unknown",
        });
        guestListUnavailable = true;
      }
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-5 text-[#202523] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between px-1 sm:mb-7">
          <p className="font-serif text-xl tracking-[-0.02em] sm:text-2xl">Shindig</p>
          <p className="rounded-full border border-[#202523]/15 bg-white/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#202523]/65 sm:text-xs">
            {OYSTER_ROAST_EVENT.cityLabel}
          </p>
        </div>

        <EventHubHeader headerSettings={headerSettings} />
        <EventModules
          features={OYSTER_ROAST_EVENT.features}
          guestList={guestList}
          guestListUnavailable={guestListUnavailable}
        />

        <footer className="mt-8 flex items-center justify-between border-t border-[#202523]/12 px-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#202523]/45 sm:mt-10">
          <span>Shuck · Sip · Stay awhile</span>
          <span>November ’26</span>
        </footer>
      </div>
    </main>
  );
}
