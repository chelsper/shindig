import Link from "next/link";

export function SiteLinks() {
  return <nav aria-label="Help and privacy" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold normal-case tracking-normal text-[#355f9e]">
    <Link href="/privacy" className="inline-flex min-h-11 items-center underline decoration-[#355f9e]/30 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]">Privacy</Link>
    <Link href="/support" className="inline-flex min-h-11 items-center underline decoration-[#355f9e]/30 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]">Support</Link>
  </nav>;
}
