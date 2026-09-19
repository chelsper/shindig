export function EventDetailsUnavailable() {
  return <main className="grid min-h-screen place-items-center bg-[#f7f0e3] px-5 text-[#202523]">
    <section className="max-w-md rounded-[1.75rem] bg-[#fffaf1] p-8 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Shindig</p>
      <h1 className="mt-3 font-serif text-3xl">A quick pause before the party.</h1>
      <p role="status" className="mt-4 text-sm leading-6">We couldn’t load the latest event details. Please refresh in a moment.</p>
      <a className="mt-4 inline-flex min-h-11 items-center text-sm text-[#355f9e] underline" href="">Try again</a>
    </section>
  </main>;
}
