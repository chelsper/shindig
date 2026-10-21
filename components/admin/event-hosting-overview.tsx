import Link from "next/link";
import { hostingRsvpStatus, hostingSectionStatus, type HostingOverview, type HostingPublication } from "../../lib/hosting-overview";
import type { EventFeatures } from "../../lib/oyster-roast-event";
import { rsvpDeadlineLabel } from "../../lib/rsvp-policy";

const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
const plural = (count: number, singular: string, multiple = `${singular}s`) => `${count} ${count === 1 ? singular : multiple}`;

export function EventHostingOverview({ id, data, features, publication }: {
  id: string; data: HostingOverview | null; features: EventFeatures; publication: HostingPublication | null;
}) {
  const base = `/admin/events/${id}`;
  if (!data) return <section aria-label="Hosting overview unavailable" className="rounded-3xl border border-[#355f9e]/20 bg-[#fffaf1]/90 p-5">
    <h2 className="font-serif text-2xl">Hosting at a glance</h2><p className="mt-2 text-sm leading-6">Activity couldn’t load. Your event setup is still available under Edit Event; no guest data has changed.</p>
    <a className={link} href={`${base}/setup`}>Refresh overview →</a>
  </section>;
  const { rsvps, potluck, questions, playlist, polls, updates } = data;
  const enabled = (feature: keyof EventFeatures) => features[feature] || Boolean(publication?.features[feature]);
  const tasks: { key: keyof EventFeatures; label: string; summary: string; detail: string; href: string; action: string; attention: boolean }[] = [];
  if (enabled("questions") || (questions?.total ?? 0) > 0) tasks.push({ key: "questions", label: "Ask the Host",
    summary: questions ? questions.unanswered ? `${plural(questions.unanswered, "question")} waiting for an answer` : questions.total ? "Every question has an answer" : "No questions yet" : "Question totals unavailable",
    detail: questions ? `${plural(questions.answeredPrivate, "answered question")} held privately · ${plural(questions.approved, "approved answer")}. Guest names and unpublished answers stay private.` : "Refresh to check again. This does not mean there are no questions.",
    href: `${base}/content?view=questions`, action: questions?.unanswered ? "Answer questions" : "Review questions", attention: Boolean(questions?.unanswered || questions?.answeredPrivate),
  });
  if (enabled("potluck") || (potluck?.items ?? 0) > 0) tasks.push({ key: "potluck", label: "Bring something",
    summary: potluck ? !potluck.items ? "No open requests yet" : potluck.remaining ? `${potluck.remaining} still needed across ${plural(potluck.uncoveredItems, "request")}` : "All open requests are covered" : "Signup totals unavailable",
    detail: potluck ? `${potluck.covered} of ${potluck.needed} requested quantities covered. Closed items and canceled quantities are excluded; these are not guest counts.` : "Refresh to check again. Existing signups are unchanged.",
    href: `${base}/content?view=potluck`, action: potluck?.items ? "Manage requests & signups" : "Set up requests", attention: Boolean(potluck?.remaining),
  });
  if (enabled("playlist") || (playlist?.total ?? 0) > 0) tasks.push({ key: "playlist", label: "Playlist", summary: playlist ? plural(playlist.total, "song suggestion") : "Playlist total unavailable",
    detail: "Review the soundtrack and remove duplicates or unwanted suggestions.", href: publication ? `${base}/guests?view=playlist` : `${base}/settings`, action: publication ? "Review playlist" : "Review Hub choices", attention: false });
  if (enabled("polls") || (polls?.total ?? 0) > 0) tasks.push({ key: "polls", label: "Polls", summary: polls ? `${plural(polls.open, "open poll")} · ${plural(polls.drafts, "draft")}` : "Poll totals unavailable",
    detail: polls ? `${plural(polls.closed, "closed poll")}. Opening a poll does not make a disabled or private section live.` : "Refresh to check again; no poll has been changed.", href: `${base}/content?view=polls`, action: "Manage polls", attention: false });
  if (enabled("updates") || (updates?.total ?? 0) > 0) tasks.push({ key: "updates", label: "Host Updates", summary: updates ? plural(updates.total, "host note") : "Update total unavailable",
    detail: "Parking tips, what to expect, and the little details guests need.", href: `${base}/content?view=updates`, action: "Manage updates", attention: false });
  tasks.sort((a, b) => Number(b.attention) - Number(a.attention));
  const unavailable = Object.values(data).some(value => value === null);
  const followups = tasks.filter(task => task.attention), otherActivity = tasks.filter(task => !task.attention);
  function taskList(entries: typeof tasks, label: string) {
    return <ul aria-label={label} className="mt-2 divide-y divide-[#202523]/10">{entries.map(task => <li key={task.key} className="min-w-0 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3 className="font-serif text-xl">{task.label}</h3><span className="text-xs text-[#355f9e]">{hostingSectionStatus(task.key, features, publication)}</span></div>
      <p className={`mt-2 text-sm font-semibold ${task.attention ? "text-[#765319]" : "text-[#202523]"}`}>{task.summary}</p><p className="mt-1 text-xs leading-5 text-[#202523]/65">{task.detail}</p>
      <Link className={link} href={task.href}>{task.action} →</Link>
    </li>)}</ul>;
  }
  return <section aria-labelledby="hosting-overview-heading" className="rounded-3xl border border-[#355f9e]/20 bg-[#fffaf1]/90 p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-x-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">Just for the host</p><h2 id="hosting-overview-heading" className="mt-2 font-serif text-3xl">Hosting at a glance</h2></div><a className={link} href={`${base}/setup`}>Refresh totals ↻</a></div>
    <p className="mt-2 text-xs leading-5 text-[#202523]/65">Saved activity for this event. Refresh for the latest; opening this overview never changes or publishes anything.</p>
    {rsvps ? <><dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[
      ["Guests attending", rsvps.totalPartySize], ["RSVP responses", rsvps.totalResponses], ["Attending households", rsvps.totalAttending], ["Declined responses", rsvps.declined],
    ].map(([label, count]) => <div key={label} className="min-w-0 rounded-2xl bg-[#e9f2f8]/65 p-3"><dt className="text-xs leading-5 text-[#202523]/70">{label}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{count}</dd></div>)}</dl>
    <p className="mt-3 text-xs leading-5 text-[#202523]/60">Attendance includes guests whose names are hidden on the public list. Responses count households, not individual people.</p></> : <p role="status" className="mt-5 rounded-xl bg-[#fff4d8] p-4 text-sm">Attendance totals couldn’t load. No zero counts are assumed.</p>}
    <div className="mt-4 border-y border-[#202523]/10 py-4 text-sm leading-6">
      <Link className={link} href={`${base}/invitations`}>Invitation tracker →</Link>
      <p className="font-semibold">{hostingRsvpStatus(publication, rsvps, data.checkedAt)}</p>
      {publication ? <>
        {publication.rsvp.capacity != null && rsvps && <p>{Math.max(0, publication.rsvp.capacity - rsvps.totalPartySize)} of {publication.rsvp.capacity} guest places remaining.</p>}
        {publication.rsvp.deadlineAtUtc && <p>Reply deadline: {rsvpDeadlineLabel(publication.rsvp.deadlineAtUtc, publication.timeZone)}.</p>}
        <p className="text-xs text-[#202523]/60">Based on the last published RSVP rules, not unpublished setup changes.{publication.visibility !== "published" ? " Guest links are unavailable; saved activity is retained." : ""}</p>
        <div className="flex flex-wrap gap-x-5"><Link className={link} href={`${base}/guests`}>Manage guests →</Link><Link className={link} href={`${base}/guests?view=contacts`}>Private contacts →</Link><Link className={link} href={`${base}/publish`}>Manage publication & replies →</Link></div>
      </> : <p>Guests can respond after you publish. Guest management opens after the first publication.</p>}
    </div>
    {unavailable && <p role="status" className="mt-4 text-xs leading-5 text-[#765319]">Some activity couldn’t be checked. Available totals remain visible; refresh to try again.</p>}
    {followups.length > 0 && taskList(followups, "Host follow-ups")}
    {otherActivity.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-[#355f9e]">{followups.length ? "More Hub activity" : "Hub activity"} · {plural(otherActivity.length, "section")}</summary>{taskList(otherActivity, "Other Hub activity")}</details>}
  </section>;
}
