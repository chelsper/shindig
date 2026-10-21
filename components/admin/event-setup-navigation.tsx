"use client";

import Link from "next/link";
import { useId, useRef, useState, type MouseEvent } from "react";

const screens = [
  { id: "details", label: "Details", path: "" },
  { id: "location", label: "Location", path: "/location" },
  { id: "artwork", label: "Artwork & design", path: "/artwork" },
  { id: "settings", label: "RSVP & Hub", path: "/settings" },
  { id: "content", label: "Hub Content", path: "/content" },
  { id: "preview", label: "Private preview", path: "/preview" },
] as const;

export type WorkspaceScreen = typeof screens[number]["id"] | "setup" | "publish" | "guests";

export function EventSetupNavigation({ id, current, onNavigate }: {
  id: string;
  current: WorkspaceScreen;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const index = screens.findIndex((screen) => screen.id === current);
  const active = screens[index], previous = screens[index - 1], next = screens[index + 1];
  const href = (path: string) => `/admin/events/${id}${path}`;
  const workspace = current === "setup" ? "overview" : current === "publish" ? "share" : current === "guests" ? "guests" : "edit";
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    onNavigate?.(event);
    if (!event.defaultPrevented) setOpen(false);
  }
  return <div className="my-5 min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); }
  }}>
    <nav aria-label="Event workspace" className="grid grid-cols-4 gap-1 rounded-2xl border border-[#355f9e]/20 bg-[#fffaf1]/90 p-1 sm:gap-2">
      {[
        { key: "overview", label: "Overview", path: "/setup" },
        { key: "edit", label: "Edit Event", path: "" },
        // The tracker works before first publication, unlike saved responses.
        { key: "guests", label: "Guests", path: "/invitations" },
        { key: "share", label: "Share", path: "/publish" },
      ].map(section => <Link key={section.key} href={href(section.path)} onClick={navigate}
        aria-current={workspace === section.key ? "page" : undefined}
        className={`flex min-h-12 min-w-0 items-center justify-center rounded-xl px-1 py-2 text-center text-xs font-semibold leading-5 text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 sm:px-3 sm:text-sm ${workspace === section.key ? "bg-[#e9f2f8] ring-1 ring-inset ring-[#355f9e]/25" : "hover:bg-[#e9f2f8]/60"}`}>
        {section.label}
      </Link>)}
    </nav>
    {active && <nav aria-label="Edit event sections" className="mt-4 min-w-0">
    <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-stretch gap-2 md:hidden">
      {previous ? <Link href={href(previous.path)} onClick={navigate} aria-label={`Back: ${previous.label}`} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border border-[#355f9e]/20 text-xs font-semibold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4"><span aria-hidden="true">←</span>Back</Link> : <span />}
      <button ref={toggle} type="button" aria-label={`Choose setup section. Current: ${active.label}`} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}
        className="flex min-h-14 min-w-0 items-center justify-between gap-2 rounded-2xl border border-[#355f9e]/30 bg-[#e9f2f8]/65 px-3 py-2 text-left text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4">
        <span className="min-w-0"><span className="block text-[0.6rem] uppercase tracking-wider">Edit event · {index + 1}/{screens.length}</span><span className="block text-xs font-semibold">{active.label}</span></span><span aria-hidden="true">{open ? "−" : "+"}</span>
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
    <Link href={href("/setup")} onClick={navigate} className="inline-flex min-h-11 items-center text-xs font-semibold text-[#355f9e] underline underline-offset-4 md:hidden">See what’s left in your setup →</Link>
    </nav>}
  </div>;
}
