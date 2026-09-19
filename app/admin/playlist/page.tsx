import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PlaylistDeleteButton } from "../../../components/admin/playlist-delete-button";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listPlaylistSuggestionsForAdmin, type AdminPlaylistSuggestion } from "../../../lib/server/playlist";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Playlist | Shindig", robots: { index: false, follow: false } };

export default async function AdminPlaylistPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  let suggestions: AdminPlaylistSuggestion[] | null = null;
  try {
    suggestions = await listPlaylistSuggestionsForAdmin();
  } catch {
    console.error("Admin playlist retrieval failed.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl sm:text-2xl" href="/admin">Shindig</Link>
          <Link className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.1em] text-[#355f9e] underline underline-offset-4" href="/admin">Back to dashboard</Link>
        </header>
        <section className="py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#355f9e]">Host Dashboard · {OYSTER_ROAST_EVENT.hostTitle}</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">Shuckin&apos; Playlist</h1>
          <p className="mt-3 text-sm leading-6 text-[#202523]/65">Guest requests for the roast. Remove duplicates or anything that doesn’t fit the party.</p>
        </section>
        <section aria-label="Playlist suggestions" className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] sm:p-7">
          {suggestions === null ? (
            <p className="py-8 text-center text-sm leading-6" role="alert">The playlist couldn’t load. Please refresh and try again.</p>
          ) : suggestions.length === 0 ? (
            <p className="py-8 text-center font-serif text-2xl">No song suggestions yet.</p>
          ) : (
            <>
              <p className="pb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#355f9e]">{suggestions.length} {suggestions.length === 1 ? "suggestion" : "suggestions"}</p>
              <ul className="divide-y divide-[#202523]/10">
                {suggestions.map((suggestion) => (
                  <li className="py-5 first:border-t first:border-[#202523]/10 sm:flex sm:items-start sm:justify-between sm:gap-6" key={suggestion.id}>
                    <div className="min-w-0 break-words">
                      <h2 className="font-serif text-2xl">{suggestion.songTitle}</h2>
                      <p className="mt-1 text-sm text-[#202523]/70">{suggestion.artist}</p>
                      <p className="mt-2 text-xs text-[#202523]/55">{suggestion.suggestedBy ? `Suggested by ${suggestion.suggestedBy}` : "No name provided"}</p>
                      <p className="mt-1 text-xs text-[#202523]/50">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: OYSTER_ROAST_EVENT.timeZone }).format(new Date(suggestion.createdAt))}</p>
                    </div>
                    <PlaylistDeleteButton id={suggestion.id} songTitle={suggestion.songTitle} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
