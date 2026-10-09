import Link from "next/link";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]";

export function ShindigHome() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] text-[#202523]">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 border-b border-[#202523]/15 py-6 sm:py-8">
          <Link href="/" aria-label="Shindig home" className={`font-serif text-3xl tracking-[-0.05em] sm:text-4xl ${focus}`}>Shindig<span className="text-[#355f9e]">.</span></Link>
          <Link href="/host/sign-in" className={`inline-flex min-h-11 items-center rounded-full border border-[#202523]/20 bg-white/30 px-4 text-[0.65rem] font-bold uppercase tracking-[0.14em] transition hover:border-[#355f9e] hover:text-[#355f9e] sm:px-5 ${focus}`}>Host dashboard <span aria-hidden="true" className="ml-2">↗</span></Link>
        </header>

        <section aria-labelledby="home-heading" className="grid items-center gap-6 pb-12 pt-12 sm:gap-10 sm:pb-20 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:py-24">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-[#355f9e] sm:text-xs">For the joy of getting together</p>
            <h1 id="home-heading" className="mt-6 max-w-xl font-serif text-[clamp(3.3rem,8vw,6.3rem)] leading-[0.97] tracking-[-0.055em]">Good people.<br />Great <span className="italic text-[#355f9e]">gatherings.</span></h1>
            <p className="mt-7 max-w-md text-base leading-7 text-[#202523]/65 sm:text-lg sm:leading-8">Big celebrations. Backyard get-togethers. A just-because dinner. Give your people a reason to show up—and one lovely place for the details.</p>
            <a href="#a-little-less-planning" className={`mt-7 inline-flex min-h-12 items-center gap-3 border-b border-[#355f9e]/35 text-sm font-semibold text-[#214e91] transition hover:border-[#355f9e] ${focus}`}>A little less planning. A lot more party. <span aria-hidden="true">↓</span></a>
          </div>

          <div aria-hidden="true" className="relative mx-auto my-7 flex aspect-square w-full max-w-[420px] items-center justify-center p-9 sm:p-11">
            <div className="absolute inset-5 rotate-[-9deg] rounded-[2rem] border border-[#355f9e]/15 bg-[#d8e8ed]" />
            <div className="absolute inset-6 rotate-[7deg] rounded-[2rem] border border-[#b0664d]/15 bg-[#e9cabc]" />
            <div className="relative flex h-full w-full rotate-[-2deg] flex-col items-center justify-center rounded-t-[45%] rounded-b-2xl border border-[#355f9e]/25 bg-[#fffaf1] px-6 py-8 text-center shadow-[0_20px_50px_rgb(32_37_35_/_0.10)]">
              <span className="text-3xl text-[#b0664d]">✳</span>
              <p className="mt-5 text-[0.55rem] font-bold uppercase tracking-[0.26em] text-[#355f9e]">You’re invited</p>
              <p className="mt-4 font-serif text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.045em]">A little<br /><span className="italic">get-together.</span></p>
              <div className="my-5 h-px w-14 bg-[#355f9e]/30" />
              <p className="text-xs leading-6 text-[#202523]/60">Your people. Your place.<br />Something worth celebrating.</p>
            </div>
            <span className="absolute bottom-1 right-0 rotate-[8deg] rounded-full border border-[#355f9e]/20 bg-[#e9f2f8] px-5 py-3 font-serif text-lg italic text-[#355f9e] sm:bottom-3">Save you a spot?</span>
          </div>
        </section>

        <section id="a-little-less-planning" aria-labelledby="plans-heading" className="scroll-mt-8 border-y border-[#202523]/15 py-10 sm:py-12">
          <h2 id="plans-heading" className="font-serif text-3xl tracking-[-0.03em] sm:text-4xl">All the details. None of the fuss.</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-7">
            {[
              ["01", "Set the scene.", "An invitation that feels like the occasion, with the who, what, when, and where all together."],
              ["02", "Count your people.", "A simple RSVP for guests. A clear headcount for the host. No guest accounts needed."],
              ["03", "Keep everyone in the loop.", "One Event Hub for the little things: song requests, host updates, questions, and what to expect."],
            ].map(([number, title, description]) => <div key={number}>
              <p className="text-[0.65rem] font-bold tracking-[0.2em] text-[#355f9e]">{number}</p>
              <h3 className="mt-3 font-serif text-2xl tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#202523]/65">{description}</p>
            </div>)}
          </div>
        </section>

        <section aria-labelledby="guest-heading" className="flex flex-col justify-between gap-6 py-10 sm:flex-row sm:items-center sm:py-12">
          <div>
            <h2 id="guest-heading" className="font-serif text-2xl tracking-[-0.02em]">Here for a Shindig?</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#202523]/65">Your host’s invitation link takes you straight to your event. Keep it handy for the RSVP and everything after.</p>
          </div>
          <p className="max-w-xs text-sm leading-6 text-[#202523]/60">Already hosting? <Link href="/host/sign-in" className={`inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline decoration-[#355f9e]/30 underline-offset-4 ${focus}`}>Open your dashboard →</Link></p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#202523]/15 py-6 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[#202523]/50">
          <span>Shindig · Made for getting together</span>
          <span>Come as you are. Stay awhile.</span>
        </footer>
      </div>
    </main>
  );
}
