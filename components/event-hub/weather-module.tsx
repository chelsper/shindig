"use client";

import { useEffect, useState } from "react";
import { LIVE_WEATHER_TTL, freshWeather, type EventWeather, type TypicalWeather } from "../../lib/weather";
import { WeatherContent } from "./weather-content";
import type { OysterRoastEvent } from "../../lib/oyster-roast-event";

export function WeatherModule({ event }: { event?: OysterRoastEvent }) {
  const [weather, setWeather] = useState<EventWeather | null>(null);
  const [typical, setTypical] = useState<TypicalWeather | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let historyRequested = false;
    let refreshAt = 0;
    async function loadTypical() {
      if (historyRequested) return;
      historyRequested = true;
      try {
        const response = await fetch("/api/weather?context=typical", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]) });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json() as { typical: TypicalWeather | null };
        if (!controller.signal.aborted) setTypical(data.typical);
      } catch {
        if (!controller.signal.aborted) setTypical(null);
        historyRequested = false;
      }
    }
    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      refreshAt = Date.now() + LIVE_WEATHER_TTL;
      try {
        const response = await fetch("/api/weather", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json() as { weather: EventWeather };
        if (!data.weather || !Number.isFinite(data.weather.expiresAt)) throw new Error("Unavailable");
        if (!controller.signal.aborted) {
          // A cache hit can already be several minutes old. Refresh when that
          // data expires, not ten minutes after this browser received it.
          refreshAt = Math.max(Date.now() + 60_000, Math.min(refreshAt, data.weather.expiresAt - 15_000));
          setWeather(data.weather);
          if (!data.weather.forecast) void loadTypical();
        }
      } catch {
        if (!controller.signal.aborted) {
          // Preserve only static sun/climate context, never old live conditions.
          setWeather((previous) => previous ? { ...previous, current: null, forecast: null, expiresAt: 0 } : null);
          void loadTypical();
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) { setLoading(false); setNow(Date.now()); }
      }
    }
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      setNow(Date.now());
      if (Date.now() >= refreshAt) void refresh();
    };
    void refresh();
    // Expire old conditions even when an open tab's network goes away.
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [attempt]);

  const fresh = weather ? freshWeather(weather, now) : null;
  return (
    <section aria-labelledby="weather-heading" className="overflow-hidden rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
      <div className="border-b border-[#202523]/10 pb-5">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">Weather</p>
        <h2 id="weather-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">A little sky watching</h2>
      </div>
      <WeatherContent event={event} weather={fresh} typical={typical} loading={loading} />
      {!loading && (!fresh?.current || (fresh.forecastInRange && !fresh.forecast) || (!fresh.forecast && typical === null)) ? (
        <button type="button" className="mt-2 min-h-11 text-sm text-[#355f9e] underline decoration-[#355f9e]/30 underline-offset-4" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Check weather again</button>
      ) : null}
    </section>
  );
}
