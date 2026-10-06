import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { eventWeatherService } from "../../../lib/server/weather";
import { getEventConfiguration } from "../../../lib/server/invitation-settings";
import { reportWeatherFailure } from "../../../lib/server/weather/diagnostics";
import { getPublishedEvent } from "../../../lib/server/event-publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (!new URL(request.url).searchParams.has("event") && !OYSTER_ROAST_EVENT.features.weather) return Response.json({ message: "Weather is not available for this event." }, { status: 404, headers });
  // The caller cannot choose a location, event, provider, date range, or API URL.
  // History loads separately so a cold archive request never delays live weather.
  try {
    const slug = new URL(request.url).searchParams.get("event");
    const event = slug === null ? await getEventConfiguration() : await getPublishedEvent(slug);
    if (!event?.features.weather || !event.coordinates) return Response.json({ message: "Weather is not available for this event." }, { status: 404, headers });
    const location = { ...event, coordinates: event.coordinates };
    if (new URL(request.url).searchParams.get("context") === "typical") {
      const typical = await eventWeatherService.typical(location);
      if (!typical) return Response.json({ message: "Historical weather is temporarily unavailable. Please try again shortly." }, { status: 503, headers: { ...headers, "Retry-After": "60" } });
      return Response.json({ typical }, { headers });
    }
    return Response.json({ weather: await eventWeatherService.live(location) }, { headers });
  } catch (error) {
    reportWeatherFailure("configuration", error);
    return Response.json({ message: "The weather is taking a quick break. Please check back shortly." }, { status: 503, headers });
  }
}
