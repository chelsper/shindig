"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

const screens = [
  { id: "setup", label: "Overview", path: "/setup" },
  { id: "details", label: "Details", path: "" },
  { id: "artwork", label: "Artwork & design", path: "/artwork" },
  { id: "settings", label: "RSVP & Hub", path: "/settings" },
  { id: "preview", label: "Private preview", path: "/preview" },
  { id: "publish", label: "Publish & share", path: "/publish" },
] as const;

export function EventSetupNavigation({ id, current, onNavigate }: {
  id: string;
  current: typeof screens[number]["id"];
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return <nav aria-label="Event setup" className="my-5 flex flex-wrap gap-2">
    {screens.map((screen) => <Link key={screen.id} href={`/admin/events/${id}${screen.path}`} onClick={onNavigate}
      aria-current={current === screen.id ? "page" : undefined}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 ${current === screen.id ? "border-[#355f9e] bg-[#e9f2f8]" : "border-[#355f9e]/20 bg-[#fffaf1]/70 hover:bg-[#e9f2f8]/70"}`}>
      {screen.label}
    </Link>)}
  </nav>;
}
