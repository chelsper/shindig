import Link from "next/link";

// Shared by the editor screens so the dashboard pill is always real navigation.
export function DashboardLink() {
  return (
    <Link
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#202523]/15 bg-white/40 px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#202523]/65 transition hover:border-[#355f9e]/50 hover:text-[#355f9e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]"
      href="/admin"
    >
      Host Dashboard
    </Link>
  );
}
