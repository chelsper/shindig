import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { eventWeatherService } from "../../../lib/server/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (!OYSTER_ROAST_EVENT.features.weather) return Response.json({ message: "Weather is not available for this event." }, { status: 404, headers });
  // The caller cannot choose a location, event, provider, date range, or API URL.
  // History loads separately so a cold archive request never delays live weather.
  try {
    if (new URL(request.url).searchParams.get("context") === "typical") {
      return Response.json({ typical: await eventWeatherService.typical(OYSTER_ROAST_EVENT) }, { headers });
    }
    return Response.json({ weather: await eventWeatherService.live(OYSTER_ROAST_EVENT) }, { headers });
  } catch {
    return Response.json({ message: "The weather is taking a quick break. Please check back shortly." }, { status: 503, headers });
  }
}
