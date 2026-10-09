"use client";

import Link from "next/link";
import { useId, useRef, useState, type MouseEvent } from "react";

const screens = [
  { id: "setup", label: "Overview", path: "/setup" },
  { id: "details", label: "Details", path: "" },
  { id: "location", label: "Location", path: "/location" },
  { id: "artwork", label: "Artwork & design", path: "/artwork" },
  { id: "settings", label: "RSVP & Hub", path: "/settings" },
  { id: "content", label: "Hub Content", path: "/content" },
  { id: "preview", label: "Private preview", path: "/preview" },
  { id: "publish", label: "Publish & share", path: "/publish" },
] as const;

export function EventSetupNavigation({ id, current, onNavigate }: {
  id: string;
  current: typeof screens[number]["id"];
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const index = screens.findIndex((screen) => screen.id === current);
  const active = screens[index], previous = screens[index - 1], next = screens[index + 1];
  const href = (path: string) => `/admin/events/${id}${path}`;
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    onNavigate?.(event);
    if (!event.defaultPrevented) setOpen(false);
  }
  return <nav aria-label="Event setup" className="my-5 min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); }
  }}>
    <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-stretch gap-2 md:hidden">
      {previous ? <Link href={href(previous.path)} onClick={navigate} aria-label={`Back: ${previous.label}`} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-[#355f9e]/20 text-xs font-semibold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4"><span aria-hidden="true">←</span>Back</Link> : <span />}
      <button ref={toggle} type="button" aria-label={`Choose setup section. Current: ${active.label}`} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}
        className="flex min-h-14 min-w-0 items-center justify-between gap-2 rounded-2xl border border-[#355f9e]/30 bg-[#e9f2f8]/65 px-3 py-2 text-left text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4">
        <span className="min-w-0"><span className="block text-[0.6rem] uppercase tracking-wider">Event setup · {index + 1}/{screens.length}</span><span className="block text-xs font-semibold">{active.label}</span></span><span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {next ? <Link href={href(next.path)} onClick={navigate} aria-label={`Next: ${next.label}`} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-[#355f9e]/20 text-xs font-semibold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4"><span aria-hidden="true">→</span>Next</Link> : <span />}
    </div>
    <div id={menuId} className={`${open ? "flex" : "hidden"} mt-2 flex-col gap-2 rounded-2xl border border-[#355f9e]/15 bg-[#fffaf1] p-2 md:mt-0 md:flex md:flex-row md:flex-wrap md:rounded-none md:border-0 md:bg-transparent md:p-0`}>
    {screens.map((screen) => <Link key={screen.id} href={href(screen.path)} onClick={navigate}
      aria-current={current === screen.id ? "page" : undefined}
      className={`inline-flex min-h-11 items-center justify-start rounded-full border px-4 py-2 text-xs font-semibold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 md:justify-center ${current === screen.id ? "border-[#355f9e] bg-[#e9f2f8]" : "border-[#355f9e]/20 bg-[#fffaf1]/70 hover:bg-[#e9f2f8]/70"}`}>
      {screen.label}
    </Link>)}
    </div>
    {current !== "setup" && <Link href={href("/setup")} onClick={navigate} className="inline-flex min-h-11 items-center text-xs font-semibold text-[#355f9e] underline underline-offset-4 md:hidden">See what’s left in your setup →</Link>}
  </nav>;
}
