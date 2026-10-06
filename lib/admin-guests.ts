import type { RsvpFilter } from "./server/rsvps";

export type EventGuestFormContext = {
  id: string;
  title: string;
  maxPartySize: number;
  guestListDefaultVisible: boolean;
  guestListEnabled: boolean;
  requestId: string;
};

export function guestListQuery(input: { filter?: unknown; q?: unknown }) {
  const filter: RsvpFilter = input.filter === "attending" || input.filter === "declined" ? input.filter : "all";
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 120) : "";
  return { filter, q };
}

export function eventGuestsPath(id: string) {
  return `/admin/events/${id}/guests`;
}
