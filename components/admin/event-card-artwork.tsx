"use client";
import Image from "next/image";
import { useState } from "react";
import type { HostEventCard } from "../../lib/event-dashboard";

export function EventCardArtwork({ image }: { image: HostEventCard["image"] }) {
  const [failed, setFailed] = useState(false);
  return <div className="relative flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#202523]/10 bg-[#e9f2f8]/60 sm:h-32 sm:w-24">
    {image && !failed ? <Image src={image.src} alt={image.alt} fill sizes="96px" className="object-contain" unoptimized onError={() => setFailed(true)} /> : <span aria-hidden="true" className="rotate-[-12deg] font-serif text-4xl italic text-[#355f9e]/60">S.</span>}
  </div>;
}
