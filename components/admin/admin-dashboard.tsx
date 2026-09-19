import Link from "next/link";

import { logoutAdmin } from "../../app/admin/actions";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import type {
  AdminRsvp,
  RsvpFilter,
  RsvpSummary,
} from "../../lib/server/rsvps";

type AdminDashboardProps = {
  filter: RsvpFilter;
  rsvps: AdminRsvp[];
  summary: RsvpSummary;
};

const filters: { label: string; value: RsvpFilter }[] = [
  { label: "All", value: "all" },
  { label: "Attending", value: "attending" },
  { label: "Can’t Make It", value: "declined" },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function StatusBadge({ attending }: { attending: boolean }) {
  return (
    <span
      className={
        attending
          ? "inline-flex rounded-full bg-[#dcebdc] px-2.5 py-1 text-xs font-bold text-[#285630]"
          : "inline-flex rounded-full bg-[#f3dfd8] px-2.5 py-1 text-xs font-bold text-[#743b31]"
      }
    >
      {attending ? "Attending" : "Can’t Make It"}
    </span>
  );
}

export function AdminDashboard({ filter, rsvps, summary }: AdminDashboardProps) {
  const event = OYSTER_ROAST_EVENT;
  const summaryCards = [
    { label: "Total Attending", value: summary.totalAttending },
    { label: "RSVP Responses", value: summary.totalResponses },
    { label: "Declined", value: summary.declined },
    { label: "Total Party Size", value: summary.totalPartySize },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9 lg:px-8">
      <div className="page-texture" />
      <div className="relative mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-[#202523]/15 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#355f9e] uppercase">
              Shindig · Host Dashboard
            </p>
            <h1 className="font-serif mt-2 text-4xl leading-none tracking-[-0.025em] sm:text-5xl">
              {event.hostTitle}
            </h1>
            <p className="mt-3 text-sm text-[#202523]/58">
              {event.shortDateLabel} · {event.cityLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link className="inline-flex min-h-10 items-center rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/75 px-4 text-xs font-bold uppercase tracking-[0.1em] text-[#214e91] transition hover:border-[#355f9e]" href="/admin/updates">Updates</Link>
            <Link className="inline-flex min-h-10 items-center rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/75 px-4 text-xs font-bold uppercase tracking-[0.1em] text-[#214e91] transition hover:border-[#355f9e]" href="/admin/questions">Questions</Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/75 px-4 text-xs font-bold uppercase tracking-[0.1em] text-[#214e91] transition hover:border-[#355f9e]"
              href="/admin/playlist"
            >
              Playlist
            </Link>
            <Link
              className="inline-flex min-h-10 items-center rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/75 px-4 text-xs font-bold uppercase tracking-[0.1em] text-[#214e91] transition hover:border-[#355f9e]"
              href="/admin/event"
            >
              Event Header
            </Link>
            <form action={logoutAdmin}>
              <button
                className="min-h-10 rounded-full border border-[#202523]/20 bg-white/35 px-4 text-xs font-bold tracking-[0.1em] uppercase transition hover:border-[#355f9e]/50 hover:text-[#355f9e]"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <section
          aria-label="RSVP summary"
          className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {summaryCards.map((card) => (
            <div
              className="rounded-2xl border border-[#202523]/10 bg-white/48 p-4 shadow-[0_12px_35px_rgb(32_37_35_/_0.05)] sm:p-5"
              key={card.label}
            >
              <p className="text-[0.65rem] font-bold tracking-[0.13em] text-[#202523]/48 uppercase sm:text-xs">
                {card.label}
              </p>
              <p className="font-serif mt-2 text-4xl text-[#355f9e] sm:text-5xl">
                {card.value}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl sm:text-3xl">Guest responses</h2>
              <p className="mt-1 text-sm text-[#202523]/55">
                {summary.totalPartySize} confirmed {summary.totalPartySize === 1 ? "guest" : "guests"}
                {filter === "all" ? ` · ${summary.totalResponses} total responses` : ` · ${rsvps.length} shown`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#202523] bg-[#202523] px-5 text-xs font-bold tracking-[0.11em] text-[#fffaf1] uppercase transition hover:border-[#355f9e] hover:bg-[#355f9e]"
                href="/admin/guests/new"
              >
                Add Guest
              </Link>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/80 px-5 text-xs font-bold tracking-[0.11em] text-[#214e91] uppercase transition hover:border-[#355f9e] hover:bg-[#e9f2f8]"
                href="/admin/export"
              >
                Export CSV
              </a>
            </div>
          </div>

          <nav aria-label="Filter RSVPs" className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => {
              const selected = item.value === filter;
              const href = item.value === "all" ? "/admin" : `/admin?status=${item.value}`;

              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={
                    selected
                      ? "whitespace-nowrap rounded-full border border-[#202523] bg-[#202523] px-4 py-2 text-xs font-bold text-[#fffaf1]"
                      : "whitespace-nowrap rounded-full border border-[#202523]/15 bg-white/35 px-4 py-2 text-xs font-bold text-[#202523]/65 transition hover:border-[#355f9e]/45 hover:text-[#355f9e]"
                  }
                  href={href}
                  key={item.value}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {rsvps.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[#202523]/20 bg-white/30 px-6 py-14 text-center">
              <p className="font-serif text-2xl">No responses here yet.</p>
              <p className="mt-2 text-sm text-[#202523]/50">Try another filter or check back soon.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 md:hidden">
                {rsvps.map((rsvp) => (
                  <article
                    className="rounded-2xl border border-[#202523]/10 bg-white/52 p-4 shadow-[0_10px_30px_rgb(32_37_35_/_0.045)]"
                    key={rsvp.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif text-xl leading-tight">{rsvp.guestName}</h3>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge attending={rsvp.attending} />
                        <Link
                          className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#355f9e] underline decoration-[#355f9e]/25 underline-offset-4"
                          href={`/admin/guests/${rsvp.id}/edit`}
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
                      <div>
                        <dt className="text-[0.64rem] font-bold tracking-[0.12em] text-[#202523]/45 uppercase">Party size</dt>
                        <dd className="mt-1 font-semibold">{rsvp.partySize ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.64rem] font-bold tracking-[0.12em] text-[#202523]/45 uppercase">Submitted</dt>
                        <dd className="mt-1 text-xs leading-relaxed">{formatDate(rsvp.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.64rem] font-bold tracking-[0.12em] text-[#202523]/45 uppercase">Guest list</dt>
                        <dd className="mt-1 font-semibold">
                          {rsvp.attending
                            ? rsvp.displayOnGuestList
                              ? "Shown"
                              : "Hidden"
                            : "—"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-[0.64rem] font-bold tracking-[0.12em] text-[#202523]/45 uppercase">Comment</dt>
                        <dd className="mt-1 break-words text-[#202523]/70">{rsvp.comment || "—"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-[0.64rem] font-bold tracking-[0.12em] text-[#202523]/45 uppercase">Last updated</dt>
                        <dd className="mt-1 text-xs">{formatDate(rsvp.updatedAt)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              <div className="mt-5 hidden overflow-hidden rounded-2xl border border-[#202523]/10 bg-white/48 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)] md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1140px] border-collapse text-left text-sm">
                    <thead className="border-b border-[#202523]/10 bg-[#202523]/[0.035] text-[0.64rem] font-bold tracking-[0.11em] text-[#202523]/48 uppercase">
                      <tr>
                        <th className="px-5 py-4">Guest Name</th>
                        <th className="px-4 py-4">RSVP Status</th>
                        <th className="px-4 py-4">Party Size</th>
                        <th className="px-4 py-4">Guest List</th>
                        <th className="px-4 py-4">Comment</th>
                        <th className="px-4 py-4">Submitted</th>
                        <th className="px-5 py-4">Last Updated</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#202523]/8">
                      {rsvps.map((rsvp) => (
                        <tr className="align-top" key={rsvp.id}>
                          <td className="font-serif px-5 py-4 text-base font-semibold">{rsvp.guestName}</td>
                          <td className="px-4 py-4"><StatusBadge attending={rsvp.attending} /></td>
                          <td className="px-4 py-4 font-semibold">{rsvp.partySize ?? "—"}</td>
                          <td className="px-4 py-4 font-semibold">
                            {rsvp.attending
                              ? rsvp.displayOnGuestList
                                ? "Shown"
                                : "Hidden"
                              : "—"}
                          </td>
                          <td className="max-w-64 px-4 py-4 break-words text-[#202523]/68">{rsvp.comment || "—"}</td>
                          <td className="px-4 py-4 text-xs leading-relaxed text-[#202523]/65">{formatDate(rsvp.createdAt)}</td>
                          <td className="px-5 py-4 text-xs leading-relaxed text-[#202523]/65">{formatDate(rsvp.updatedAt)}</td>
                          <td className="px-5 py-4 text-right">
                            <Link
                              className="text-xs font-bold uppercase tracking-[0.1em] text-[#355f9e] underline decoration-[#355f9e]/25 underline-offset-4 transition hover:decoration-[#355f9e]"
                              href={`/admin/guests/${rsvp.id}/edit`}
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
