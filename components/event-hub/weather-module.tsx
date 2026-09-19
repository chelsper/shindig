import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";

// The forecast state belongs here; no weather service is needed for this shell.
export function WeatherModule() {
  return (
    <section
      aria-labelledby="weather-heading"
      className="overflow-hidden rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7"
    >
      <div className="border-b border-[#202523]/10 pb-5">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.2em] text-[#355f9e]">Weather</p>
        <h2 id="weather-heading" className="mt-1.5 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
          A little sky watching
        </h2>
      </div>

      <div className="py-8 text-center sm:py-10">
        <svg aria-hidden="true" className="mx-auto mb-5 h-20 w-28 text-[#355f9e]" fill="none" viewBox="0 0 112 80" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
          <circle cx="42" cy="29" r="13" fill="#f6e8b6" stroke="none" />
          <path d="M42 8V3M21 29h-5M27 14l-4-4M57 14l4-4M30 43l-4 4M63 29h5" opacity=".6" />
          <path d="M35 59a11 11 0 0 1-2-22 18 18 0 0 1 34-5 14 14 0 1 1 7 27H35Z" fill="#e9f2f8" />
          <path d="M34 68h38M44 74h18" opacity=".35" />
        </svg>
        <p className="font-serif text-2xl tracking-[-0.02em] sm:text-3xl">Forecast coming soon</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#202523]/65">
          It’s a little early to call the weather for our backyard roast.
          Check back closer to {OYSTER_ROAST_EVENT.shortDateLabel}.
        </p>
      </div>

      <p className="border-t border-[#202523]/8 pt-4 text-xs leading-5 text-[#202523]/55">
        {OYSTER_ROAST_EVENT.cityLabel} · {OYSTER_ROAST_EVENT.timeLabel}
      </p>
    </section>
  );
}
