import { InvitationPage } from "../components/invitation-page";
import { getEventConfiguration } from "../lib/server/invitation-settings";
import { EventDetailsUnavailable } from "../components/event-details-unavailable";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  try {
    const event = await getEventConfiguration();
    return { title: event.title, description: event.description };
  } catch { return { title: "Invitation | Shindig" }; }
}

export default async function Home() {
  const persistenceDisabled =
    process.env.NODE_ENV === "development" && !process.env.DATABASE_URL?.trim();

  let event;
  try {
    event = await getEventConfiguration();
  } catch {
    console.error("Invitation details unavailable.");
    return <EventDetailsUnavailable />;
  }
  return <InvitationPage event={event} persistenceDisabled={persistenceDisabled} />;
}
