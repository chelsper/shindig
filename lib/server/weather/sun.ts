import "server-only";
import { DAY_MS, localDate, type WeatherLocation } from "../../weather";

// NOAA's approximate solar equations, 90.833° zenith (refraction included):
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
// Astronomical calculation, NOT a weather forecast. Accuracy is a few minutes.
export function eventSun(event: WeatherLocation) {
  const midnight = Date.parse(localDate(event.startsAtUtc, event.timeZone));
  const year = new Date(midnight).getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - yearStart) / DAY_MS;
  const day = (midnight - yearStart) / DAY_MS;
  const radians = Math.PI / 180;
  const latitude = event.coordinates.latitude * radians;
  const longitude = event.coordinates.longitude;
  function calculate(sunset: boolean) {
    let minutes = sunset ? 1080 : 360;
    for (let iteration = 0; iteration < 3; iteration++) {
      const gamma = 2 * Math.PI / daysInYear * (day + (minutes / 60 - 12) / 24);
      const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
      const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
      const cosine = Math.cos(90.833 * radians) / (Math.cos(latitude) * Math.cos(declination)) - Math.tan(latitude) * Math.tan(declination);
      if (cosine < -1 || cosine > 1) return null; // Polar night/day.
      const angle = Math.acos(cosine) / radians;
      minutes = 720 - 4 * (longitude + (sunset ? -angle : angle)) - equation;
    }
    return midnight + Math.round(minutes) * 60_000;
  }
  return { sunrise: calculate(false), sunset: calculate(true) };
}
