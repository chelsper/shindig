import type { Metadata } from "next";
import { InvitationPage } from "./invitation-page";
import { EventDetailsUnavailable } from "./event-details-unavailable";
import { getEventConfiguration } from "../lib/server/invitation-settings";

// Shared by the Jasper Shucks root and the explicit invitation compatibility
// route. Keep one renderer so domain separation cannot fork the RSVP behavior.
export async function getInvitationMetadata(): Promise<Metadata> {
  try {
    const event = await getEventConfiguration();
    return { title: event.title, description: event.description, alternates: { canonical: event.websiteUrl } };
  } catch { return { title: "Invitation | Shindig" }; }
}

export async function renderInvitation() {
  const persistenceDisabled = process.env.NODE_ENV === "development" && !process.env.DATABASE_URL?.trim();
  try {
    const event = await getEventConfiguration();
    return <InvitationPage event={event} persistenceDisabled={persistenceDisabled} />;
  } catch {
    console.error("Invitation details unavailable.");
    return <EventDetailsUnavailable />;
  }
}
