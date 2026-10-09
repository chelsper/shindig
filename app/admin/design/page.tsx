import type { Metadata } from "next";
import Link from "next/link";
import { ContentShell } from "../../../components/admin/content-shell";
import { AdminLoginForm } from "../../../components/admin/admin-login-form";
import { getEventDesign, parseEventDesignId } from "../../../lib/event-design";
import { isAdminAuthenticated, isAdminConfigured } from "../../../lib/server/admin-session";
import { listEventDrafts } from "../../../lib/server/event-drafts";
import { listHostPublications } from "../../../lib/server/event-publications";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Use Your Design | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function UseDesignPage({ searchParams }: { searchParams: Promise<{ style?: string | string[] }> }) {
  const style = parseEventDesignId((await searchParams).style);
  if (!style) return <ContentShell title="Choose your look" contextLabel="Event design" description="Start in the playground, then bring a style into your own event."><Link className="primary-button inline-flex min-h-12 items-center px-5" href="/design">Open design playground</Link></ContentShell>;
  const design = getEventDesign(style);
  if (!(await isAdminAuthenticated())) return <ContentShell title={`Make ${design.name} yours`} contextLabel="Host access" description="Sign in to choose an event. Your style selection will be waiting; nothing has been saved or published.">
    <section className="max-w-md rounded-3xl border border-[#202523]/15 bg-[#fffaf1] p-6">{isAdminConfigured() ? <AdminLoginForm designStyle={style} /> : <p role="alert">Host access is not configured. Ask the host to finish the server setup.</p>}</section>
  </ContentShell>;
  let drafts;
  try {
    const [allDrafts, publications] = await Promise.all([listEventDrafts(), listHostPublications()]);
    const archived = new Set(publications.filter(({ visibility }) => visibility === "archived").map(({ id }) => id));
    drafts = allDrafts.filter(({ id }) => !archived.has(id));
  } catch {
    return <ContentShell title="Your events couldn’t load" contextLabel="Event design" description="Your style choice and existing events haven’t changed. Refresh to try again." dashboardHref="/admin/events"><Link className="inline-flex min-h-12 items-center text-[#355f9e] underline" href={`/admin/design?style=${style}`}>Try again</Link></ContentShell>;
  }
  return <ContentShell title={`A little ${design.name.toLowerCase()}, a little you`} contextLabel="Use your design" description="Choose the event you want to style. Apply the look, save it privately, then review and publish." dashboardHref="/admin/events">
    <p className="mb-5 rounded-2xl bg-[#e9f2f8] p-4 text-sm leading-6">Only the {design.name} style choice carries over. Playground artwork and crops stay in your browser; add them in the event editor. Jasper Shucks stays unchanged.</p>
    <Link href={`/admin/events/new?style=${style}`} className="primary-button inline-flex min-h-12 items-center px-5">+ Create an event with {design.name}</Link>
    <h2 className="mt-8 font-serif text-2xl">Or choose an existing event</h2>
    {drafts.length ? <ul className="my-4 space-y-3" aria-label="Events to style">{drafts.map((draft) => <li key={draft.id}><Link href={`/admin/events/${draft.id}/artwork?style=${style}`} className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-[#202523]/15 bg-[#fffaf1] p-5 text-sm font-semibold"><span className="min-w-0 break-words">{draft.title}</span><span aria-hidden="true">→</span></Link></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-[#202523]/65">No active event drafts yet. Create one above to get started.</p>}
    <Link className="mt-4 inline-flex min-h-12 items-center text-sm text-[#355f9e] underline" href="/design">Back to the playground</Link>
  </ContentShell>;
}
