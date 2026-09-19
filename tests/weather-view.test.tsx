import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeatherContent } from "../components/event-hub/weather-content";
import { forecast, typical, weather } from "./fixtures/weather";

describe("compact weather views", () => {
  it("clearly separates typical weather, current conditions and event-day sunset", () => {
    const html = renderToStaticMarkup(<WeatherContent weather={weather} typical={typical} />);
    expect(html).toContain("Typical Weather");
    expect(html).toContain("not a forecast");
    expect(html).toContain("Current Weather");
    expect(html).toContain("model estimate, not the event forecast");
    expect(html).toContain("20 years");
    expect(html).toContain("140 days");
    expect(html).toContain("at least 1 mm");
    expect(html).toContain("5:35 PM");
    expect(html).not.toContain("10:35 PM");
    expect(html).toContain("CC BY 4.0");
    expect(html).not.toContain("Event Forecast");
  });
  it("prioritizes actual event forecast over historical averages", () => {
    const html = renderToStaticMarkup(<WeatherContent weather={{ ...weather, mode: "forecast", forecastInRange: true, forecast }} typical={typical} />);
    expect(html).toContain("Event Forecast");
    expect(html).not.toContain("Typical Weather");
    expect(html).toContain("30% maximum precipitation");
    expect(html).toContain("winds up to 16 mph, gusts up to 27 mph");
    expect(html).not.toContain("Hourly event forecast");
  });
  it("shows a wrapping local-time evening timeline on event day", () => {
    const html = renderToStaticMarkup(<WeatherContent weather={{ ...weather, mode: "event-day", forecastInRange: true, forecast }} typical={null} />);
    expect(html).toContain("Weather for tonight");
    expect(html).toContain("Hourly event forecast");
    expect(html).toContain("3 PM");
    expect(html).toContain("5 PM");
    expect(html).toContain("9 PM");
    expect(html.match(/<li /g)).toHaveLength(7);
    expect(html).toContain("grid-cols-4");
    expect(html).not.toContain("20:00");
  });
  it("keeps the module useful during a provider failure without fake or stale values", () => {
    const html = renderToStaticMarkup(<WeatherContent weather={{ ...weather, current: null, forecastInRange: true }} typical={null} />);
    expect(html).toContain("Historical weather is taking a quick break");
    expect(html).toContain("Current weather is temporarily unavailable");
    expect(html).toContain("event forecast is temporarily unavailable");
    expect(html).toContain("Sunset at the Shindig");
    expect(html).not.toContain("82°");
    expect(html).not.toContain("0%");
  });
  it("does not show zero precipitation for missing forecast probabilities", () => {
    const html = renderToStaticMarkup(<WeatherContent weather={{ ...weather, mode: "forecast", forecast: { ...forecast, precipitationProbability: null } }} typical={null} />);
    expect(html).toContain("Precipitation probability isn’t available yet");
    expect(html).not.toContain("0%");
  });
});
