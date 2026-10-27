import Link from "next/link";
import type { ReactNode } from "react";
import { SHINDIG_BUSINESS } from "../lib/site";
import { SiteLinks } from "./site-links";

export const informationLinkClass = "text-[#355f9e] underline decoration-[#355f9e]/35 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]";

export function SiteInformationLayout({ eyebrow, title, introduction, children }: {
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  return <div className="relative min-h-screen bg-[#f7f0e3] text-[#202523]">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto max-w-5xl px-5 sm:px-8 lg:px-10">
      <header className="flex items-center justify-between gap-4 border-b border-[#202523]/15 py-6 sm:py-8">
        <Link href="/" aria-label="Shindig home" className="font-serif text-3xl tracking-[-0.05em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e] sm:text-4xl">Shindig<span className="text-[#355f9e]">.</span></Link>
        <Link href="/host/sign-in" className="inline-flex min-h-11 items-center rounded-full border border-[#202523]/20 bg-white/30 px-4 text-xs font-semibold text-[#355f9e] hover:border-[#355f9e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]">Host sign-in <span aria-hidden="true" className="ml-2">↗</span></Link>
      </header>
      <main id="main-content" className="mx-auto max-w-2xl py-12 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">{eyebrow}</p>
        <h1 className="mt-4 text-balance font-serif text-5xl leading-[1.06] tracking-[-0.04em] sm:text-6xl">{title}</h1>
        <p className="mt-5 text-base leading-7 text-[#202523]/75 sm:text-lg sm:leading-8">{introduction}</p>
        {children}
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#202523]/15 py-6">
        <p className="text-xs leading-6 text-[#202523]/70">{SHINDIG_BUSINESS.name}<br />{SHINDIG_BUSINESS.location}</p>
        <SiteLinks />
      </footer>
    </div>
  </div>;
}
