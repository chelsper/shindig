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
import { getAdminGuestEvent } from "../../../../../lib/server/admin-event-guests";
import { eventStatus } from "../../../../../lib/event-lifecycle";
import { isDraftId } from "../../../../../lib/event-drafts";
import { draftEventSlug } from "../../../../../lib/event-routes";
import { listRsvps, getRsvpSummary } from "../../../../../lib/server/rsvps";
import { listQuestionsForAdmin } from "../../../../../lib/server/questions";
import { listHostUpdatesForAdmin } from "../../../../../lib/server/updates";
import { listPollsForAdmin } from "../../../../../lib/server/polls";
import { listPlaylistSuggestionsForAdmin } from "../../../../../lib/server/playlist";
import { guestListQuery } from "../../../../../lib/admin-guests";
import { EventGuestList } from "../../../../../components/admin/event-guest-list";
import { rsvpDeadlineLabel } from "../../../../../lib/rsvp-policy";
export const dynamic = "force-dynamic";
export const metadata = { title: "Event responses | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const views = ["rsvps", "questions", "updates", "playlist", "polls"] as const;
const labels = { rsvps: "Guest responses", questions: "Ask the Host", updates: "Host Updates", playlist: "Playlist", polls: "Polls" };
export default async function EventGuests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; filter?: string; q?: string; saved?: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const { id } = await params;
  if (!isDraftId(id)) notFound();
  const search = await searchParams;
  const slug = draftEventSlug(id), requested = search.view;
  const { filter, q } = guestListQuery(search);
  const view = views.find((v) => v === requested) ?? "rsvps";
  let data;
  try { data = await getAdminGuestEvent(id); }
  catch { return <ContentShell title="Responses couldn’t load" contextLabel="Your event" description="Please try again shortly." dashboardHref={`/admin/events/${id}/publish`}>{null}</ContentShell>; }
  if (!data) notFound();
  const { event, scope, publication } = data;
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
      const result = await Promise.all([listRsvps(filter, scope, q), getRsvpSummary(scope)]).catch(() => null);
      if (!result) content = failed;
      else {
      const [responses, summary] = result;
      content = <>{(event.rsvp?.capacity != null || event.rsvp?.deadlineAtUtc) && <section className="mb-5 rounded-2xl bg-[#e9f2f8]/60 p-4 text-sm leading-6" aria-label="Published RSVP limits"><p className="font-semibold">Published RSVP limits</p>{event.rsvp.capacity != null && <p>{summary.totalPartySize} of {event.rsvp.capacity} guest places filled, including hidden guests.</p>}{event.rsvp.deadlineAtUtc && <p>Guest replies and edits close {rsvpDeadlineLabel(event.rsvp.deadlineAtUtc, event.timeZone)}.</p>}<p>Host corrections remain available after closing. Attendance increases must fit the capacity.</p><Link className="inline-flex min-h-11 items-center text-[#355f9e] underline underline-offset-4" href={`/admin/events/${id}/settings#rsvp-limits`}>Adjust limits in the draft, then publish →</Link></section>}<EventGuestList id={id} timeZone={event.timeZone} responses={responses} summary={summary} filter={filter} q={q} saved={search.saved} /></>;
    }
      }
  return <ContentShell title={labels[view]} contextLabel={event.title} description="Only this event’s responses and content. Guest names on private questions stay here." dashboardHref={`/admin/events/${id}/publish`}>
    <p className="mb-5 text-sm text-[#202523]/65">{eventStatus(publication)} · Host management remains available.</p>
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Manage this event">{views.map((v) => <Link key={v} href={`/admin/events/${id}/guests?view=${v}`} aria-current={v === view ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border border-[#355f9e]/25 px-4 text-sm ${v === view ? "bg-[#e9f2f8]" : ""}`}>{labels[v]}</Link>)}</nav>
    {view !== "rsvps" && !event.features[view] && <p className="mb-5 rounded-xl bg-[#fff4d8] p-4 text-sm">This feature is currently hidden on the public Hub. Existing content remains manageable here.</p>}
    <HostEventProvider slug={slug} timeZone={event.timeZone}>{content}</HostEventProvider>
  </ContentShell>;
}
