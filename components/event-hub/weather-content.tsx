import { OYSTER_ROAST_EVENT, type OysterRoastEvent } from "../../lib/oyster-roast-event";
import { weatherTime, type EventForecast, type EventWeather, type TypicalWeather } from "../../lib/weather";

const degrees = (value: number | null) => value === null ? "—" : `${Math.round(value)}°`;
const headingClass = "font-serif text-2xl tracking-[-0.02em]";
const detailClass = "text-xs leading-5 text-[#202523]/60";

function TemperatureRow({ high, low, eventTemperature, event }: Pick<EventForecast, "high" | "low" | "eventTemperature"> & { event: OysterRoastEvent }) {
  return <dl className="mt-5 grid grid-cols-3 gap-2">
    {[{ label: "High", value: high }, { label: "Low", value: low }, { label: `Around ${event.timeLabel}`, value: eventTemperature }].map(({ label, value }) => (
      <div key={label} className="min-w-0 border-l border-[#355f9e]/15 pl-3 first:border-l-0 first:pl-0">
        <dt className="min-h-8 text-[0.65rem] leading-4 text-[#202523]/60 sm:min-h-4">{label}</dt>
        <dd className="mt-1 font-serif text-3xl tabular-nums sm:text-4xl">{degrees(value)}<span className="ml-0.5 font-sans text-xs text-[#202523]/55">{value !== null ? "F" : ""}</span></dd>
      </div>
    ))}
  </dl>;
}

function TypicalConditions({ typical, event }: { typical: TypicalWeather | null | undefined; event: OysterRoastEvent }) {
  const month = new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone, month: "long" }).format(new Date(event.startsAtUtc));
  const windowDate = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  return <div>
    <h3 className={headingClass}>Typical Weather</h3>
    <p className={`mt-1 ${detailClass}`}>A little context for {month}, not a forecast.</p>
    {typical ? <>
      <TemperatureRow {...typical} event={event} />
      <p className="mt-4 text-sm leading-6"><span className="font-semibold text-[#355f9e]">{Math.round(typical.wetDayPercent)}%</span> of historical days had precipitation.</p>
      <details className={`mt-2 ${detailClass}`}>
        <summary className="min-h-11 cursor-pointer py-3 underline decoration-[#202523]/20 underline-offset-4">Based on {typical.years.length} years of nearby weather</summary>
        <p className="pb-2">Shindig averages for {windowDate(typical.windowStart)}–{windowDate(typical.windowEnd)}, {typical.years[0]}–{typical.years[typical.years.length - 1]} ({typical.sampleDays} days). Regional ERA5 historical estimates, not backyard measurements. Wet days have at least 1 mm of precipitation; this is not the chance of rain at the party. The evening average uses the event’s local start hour.</p>
      </details>
    </> : <p role="status" className={`mt-4 ${detailClass}`}>{typical === undefined ? `Looking back at past ${month}s…` : "Historical weather is taking a quick break. Check back shortly."}</p>}
  </div>;
}

function ForecastConditions({ weather, event }: { weather: EventWeather & { forecast: EventForecast }; event: OysterRoastEvent }) {
  const { forecast, timeZone } = weather;
  const eventDay = weather.mode === "event-day";
  return <div>
    <h3 className={headingClass}>{eventDay ? "Weather for tonight" : "Event Forecast"}</h3>
    <p className={`mt-1 ${detailClass}`}>{eventDay ? "Event-day forecast" : event.shortDateLabel} · {forecast.condition}</p>
    {eventDay && forecast.hours.length ? <ol aria-label="Hourly event forecast" className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
      {forecast.hours.map((hour) => <li key={hour.at} className={`min-w-0 rounded-xl px-1.5 py-3 text-center ${hour.at === Date.parse(event.startsAtUtc) ? "bg-[#355f9e]/12 ring-1 ring-inset ring-[#355f9e]/20" : "bg-[#355f9e]/5"}`}>
        <p className="text-[0.65rem] font-semibold">{weatherTime(hour.at, timeZone)}</p>
        <p className="my-1 font-serif text-2xl">{degrees(hour.temperature)}<span className="sr-only">Fahrenheit</span></p>
        <p className="break-words text-[0.6rem] leading-4 text-[#202523]/65">{hour.condition}</p>
        {hour.precipitationProbability !== null ? <p className="mt-1 text-[0.6rem] text-[#355f9e]">{Math.round(hour.precipitationProbability)}% precip.</p> : null}
      </li>)}
    </ol> : null}
    <TemperatureRow {...forecast} event={event} />
    <p className="mt-4 text-sm leading-6">{forecast.precipitationProbability === null ? "Precipitation probability isn’t available yet." : `${Math.round(forecast.precipitationProbability)}% maximum precipitation chance for the day.`}</p>
    {(forecast.windSpeed ?? 0) >= 15 || (forecast.windGusts ?? 0) >= 25 ? <p className={`mt-1 ${detailClass}`}>Breezy: {forecast.windSpeed !== null ? `winds up to ${Math.round(forecast.windSpeed)} mph` : "wind speed unavailable"}{forecast.windGusts !== null ? `, gusts up to ${Math.round(forecast.windGusts)} mph` : ""}.</p> : null}
    <p className={`mt-2 ${detailClass}`}>Updated {weatherTime(weather.fetchedAt, timeZone, true)} local time. Forecasts can change.</p>
  </div>;
}

export function WeatherContent({ weather, typical, loading = false, event = OYSTER_ROAST_EVENT }: { weather: EventWeather | null; typical: TypicalWeather | null | undefined; loading?: boolean; event?: OysterRoastEvent }) {
  return <>
    <div className="py-5">
      {loading && !weather ? <p role="status" className={detailClass}>Checking the skies in {event.cityLabel}…</p> : weather?.forecast ? <ForecastConditions event={event} weather={{ ...weather, forecast: weather.forecast }} /> : <>
        <TypicalConditions typical={typical} event={event} />
        {weather?.mode === "past" ? <p className={`mt-2 ${detailClass}`}>The roast has passed. These are historical averages, not conditions recorded at the event.</p> : weather?.forecastInRange ? <p className={`mt-2 ${detailClass}`}>The event forecast is temporarily unavailable. Please check back shortly.</p> : <p className={`mt-2 ${detailClass}`}>The event forecast will appear here when it’s close enough to call.</p>}
      </>}
    </div>

    {weather?.sun.sunset ? <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-[#f6e8b6]/40 px-4 py-3">
      <div><p className="text-sm font-medium">Sunset at the Shindig</p><p className="mt-0.5 text-[0.65rem] text-[#202523]/60">{new Intl.DateTimeFormat("en-US", { timeZone: weather.timeZone, month: "long", day: "numeric" }).format(weather.sun.sunset)} · approximate · local time</p></div>
      <p className="font-serif text-2xl text-[#785b24]">{weatherTime(weather.sun.sunset, weather.timeZone, true)}</p>
    </div> : null}

    <div className="mt-5 border-t border-[#202523]/10 pt-4">
      <h3 className="text-sm font-semibold">Current Weather</h3>
      {weather?.current ? <>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-serif text-3xl">{degrees(weather.current.temperature)}<span className="font-sans text-xs"> F</span></span><span className="text-sm">{weather.current.condition}</span></p>
        <p className={`mt-1 ${detailClass}`}>{event.cityLabel} · {weatherTime(weather.current.at, weather.timeZone, true)} local time · model estimate, not the event forecast.</p>
      </> : <p role="status" className={`mt-2 ${detailClass}`}>{loading ? "Checking current conditions…" : "Current weather is temporarily unavailable. Please check back shortly."}</p>}
    </div>
    <p className="mt-5 text-[0.65rem] leading-5 text-[#202523]/55">Weather data: <a className="underline underline-offset-2" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> / <a className="underline underline-offset-2" href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noreferrer">ERA5</a> (<a className="underline underline-offset-2" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>). Historical averages calculated by Shindig.</p>
  </>;
}
