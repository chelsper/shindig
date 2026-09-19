import Link from "next/link";
import type { ReactNode } from "react";

import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";

export function ContentShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl sm:text-2xl" href="/admin">Shindig</Link>
          <Link className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.1em] text-[#355f9e] underline underline-offset-4" href="/admin">Back to dashboard</Link>
        </header>
        <section className="py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#355f9e]">Host Dashboard · {OYSTER_ROAST_EVENT.hostTitle}</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-[#202523]/65">{description}</p>
        </section>
        {children}
      </div>
    </main>
  );
}
