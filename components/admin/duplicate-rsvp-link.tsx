import Link from "next/link";
export function DuplicateRsvpLink({ id, count }: { id?: string; count?: number | null }) {
  const href = id ? `/admin/events/${id}/guests/duplicates` : "/admin/guests/duplicates";
  return <div className="my-5 rounded-2xl border border-[#355f9e]/20 bg-[#e9f2f8]/50 px-4 py-3 text-sm">
    <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-[#355f9e] underline underline-offset-4">{count ? `${count} possible duplicate RSVP ${count === 1 ? "match" : "matches"} · Review` : "Review possible duplicate RSVPs"} →</Link>
    <p className="text-xs leading-5 text-[#202523]/65">Similar names are only suggestions. You decide whether to merge or keep separate.</p>
  </div>;
}
