import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { HostEventProvider } from "../../../../../components/admin/host-event-context";
import { HostQuestionsManager } from "../../../../../components/admin/host-questions-manager";
import { HostUpdatesManager } from "../../../../../components/admin/host-updates-manager";
import { HostPollsManager } from "../../../../../components/admin/host-polls-manager";
import { PlaylistDeleteButton } from "../../../../../components/admin/playlist-delete-button";
import { TrackDetails } from "../../../../../components/music/track-details";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { getPublishedEvent } from "../../../../../lib/server/event-publications";
import { resolvePublicEventScope } from "../../../../../lib/server/event-scope";
import { isDraftId } from "../../../../../lib/event-drafts";
import { draftEventSlug } from "../../../../../lib/event-routes";
import { listRsvps, getRsvpSummary } from "../../../../../lib/server/rsvps";
import { listQuestionsForAdmin } from "../../../../../lib/server/questions";
import { listHostUpdatesForAdmin } from "../../../../../lib/server/updates";
import { listPollsForAdmin } from "../../../../../lib/server/polls";
import { listPlaylistSuggestionsForAdmin } from "../../../../../lib/server/playlist";
export const dynamic = "force-dynamic";
export const metadata = { title: "Event responses | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const views = ["rsvps", "questions", "updates", "playlist", "polls"] as const;
const labels = { rsvps: "Guest responses", questions: "Ask the Host", updates: "Host Updates", playlist: "Playlist", polls: "Polls" };
export default async function EventGuests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  const slug = draftEventSlug(id), requested = (await searchParams).view;
  const view = views.find((v) => v === requested) ?? "rsvps";
  let data;
  try { data = await Promise.all([getPublishedEvent(slug), resolvePublicEventScope(slug)]); }
  catch { return <ContentShell title="Responses couldn’t load" contextLabel="Your event" description="Please try again shortly." dashboardHref={`/admin/events/${id}/publish`}>{null}</ContentShell>; }
  const [event, scope] = data;
  if (!event || !scope) notFound();
  const failed = <p role="alert">This section couldn’t load. Please refresh and try again.</p>;
  let content;
    if (view === "questions") {
      const questions = await listQuestionsForAdmin(scope).catch(() => null);
      content = questions ? <HostQuestionsManager questions={questions} /> : failed;
    }
    else if (view === "updates") {
      const updates = await listHostUpdatesForAdmin(scope).catch(() => null);
      content = updates ? <HostUpdatesManager updates={updates} /> : failed;
    }
    else if (view === "polls") {
      const polls = await listPollsForAdmin(scope).catch(() => null);
      content = polls ? <HostPollsManager polls={polls} /> : failed;
    }
    else if (view === "playlist") {
      const songs = await listPlaylistSuggestionsForAdmin(scope).catch(() => null);
      content = !songs ? failed : songs.length ? <ul className="space-y-4">{songs.map((song) => <li className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5" key={song.id}><TrackDetails track={song} attribution={song.attribution} /><p className="my-3 text-xs">{song.suggestedBy ? `Suggested by ${song.suggestedBy}` : "No name provided"} · {song.applauseCount} applause</p><PlaylistDeleteButton id={song.id} songTitle={song.songTitle} /></li>)}</ul> : <p>No song suggestions yet.</p>;
    } else {
      const result = await Promise.all([listRsvps("all", scope), getRsvpSummary(scope)]).catch(() => null);
      if (!result) content = failed;
      else {
      const [responses, summary] = result;
      content = <><div className="mb-5 grid grid-cols-2 gap-3"><p className="rounded-2xl bg-[#e9f2f8] p-4"><strong className="block font-serif text-3xl">{summary.totalPartySize}</strong>guests attending</p><p className="rounded-2xl bg-[#e9f2f8] p-4"><strong className="block font-serif text-3xl">{summary.totalResponses}</strong>responses · {summary.declined} declined</p></div><a className="inline-flex min-h-11 text-sm text-[#355f9e] underline" href={`/admin/events/${id}/guests/export`}>Export CSV</a>
        {responses.length ? <ul className="space-y-3">{responses.map((rsvp) => <li className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5" key={rsvp.id}><h2 className="break-words font-serif text-2xl">{rsvp.guestName}</h2><p className="mt-2 text-sm">{rsvp.attending ? `Attending · Party of ${rsvp.partySize}` : "Can’t make it"} · {rsvp.attending && rsvp.displayOnGuestList ? "Name visible" : "Name hidden"}</p>{rsvp.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{rsvp.comment}</p>}<p className="mt-3 text-xs text-[#202523]/60">Submitted {new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(rsvp.createdAt))}</p></li>)}</ul> : <p className="py-8 text-center">No responses yet. Your invitation is ready to share.</p>}</>;
    }
      }
  return <ContentShell title={labels[view]} contextLabel={event.title} description="Only this event’s responses and content. Guest names on private questions stay here." dashboardHref={`/admin/events/${id}/publish`}>
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Manage this event">{views.map((v) => <Link key={v} href={`/admin/events/${id}/guests?view=${v}`} aria-current={v === view ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border border-[#355f9e]/25 px-4 text-sm ${v === view ? "bg-[#e9f2f8]" : ""}`}>{labels[v]}</Link>)}</nav>
    {view !== "rsvps" && !event.features[view] && <p className="mb-5 rounded-xl bg-[#fff4d8] p-4 text-sm">This feature is currently hidden on the public Hub. Existing content remains manageable here.</p>}
    <HostEventProvider slug={slug} timeZone={event.timeZone}>{content}</HostEventProvider>
  </ContentShell>;
}
