import type { EventFeatures } from "../../lib/oyster-roast-event";
import type { PublicGuestList } from "../../lib/server/rsvps";
import { GuestListModule } from "./guest-list-module";

type EventModulesProps = {
  features: EventFeatures;
  guestList: PublicGuestList | null;
  guestListUnavailable?: boolean;
};

export function EventModules({
  features,
  guestList,
  guestListUnavailable = false,
}: EventModulesProps) {
  if (!features.guestList) return null;

  return (
    <div className="mt-6">
      <GuestListModule
        guestList={guestList}
        unavailable={guestListUnavailable}
      />
    </div>
  );
}
