import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { getHostHubContentEvent } from "../../../../../lib/server/host-hub-content";
import { hubContentView } from "../../../../../lib/event-hub-content";
import { EventHubContent } from "../../../../../components/admin/event-hub-content";
import { ContentShell } from "../../../../../components/admin/content-shell";
import { HostPotluckManager } from "../../../../../components/admin/host-potluck-manager";
import { HostPollsManager } from "../../../../../components/admin/host-polls-manager";
import { HostUpdatesManager } from "../../../../../components/admin/host-updates-manager";
import { HostQuestionsManager } from "../../../../../components/admin/host-questions-manager";
import { listHostPotluckItems } from "../../../../../lib/server/potluck";
import { listPollsForAdmin } from "../../../../../lib/server/polls";
import { listHostUpdatesForAdmin } from "../../../../../lib/server/updates";
import { listQuestionsForAdmin } from "../../../../../lib/server/questions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hub Content | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function HubContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  if (!(await isHostAuthenticated())) redirect("/host/sign-in");
  const { id } = await params;
  const view = hubContentView((await searchParams).view);
  let data;
  try { data = await getHostHubContentEvent(id); }
  catch { return <ContentShell title="Hub content couldn’t load" contextLabel="Event setup" dashboardHref="/admin/events" description="Please try again shortly. Nothing has been published.">{null}</ContentShell>; }
  if (!data) notFound();
  const { draft, settings, publication, scope, slug } = data;
  const live = publication?.visibility === "published" && publication.snapshot.settings.features[view];
  const failed = <p role="alert" className="rounded-2xl bg-[#fff4d8] p-5 text-sm leading-6">This section couldn’t load. Please try again. If this is the first Hub Content setup, check migration 023 has been applied. <Link className="underline" href={`/admin/events/${id}/content?view=${view}`}>Reload this section</Link></p>;
  let content;
  if (view === "potluck") {
    const items = await listHostPotluckItems(slug).catch(() => null);
    content = items ? <HostPotluckManager initial={items} /> : failed;
  } else if (view === "polls") {
    const polls = await listPollsForAdmin(scope).catch(() => null);
    content = polls ? <HostPollsManager polls={polls} /> : failed;
  } else if (view === "updates") {
    const updates = await listHostUpdatesForAdmin(scope).catch(() => null);
    content = updates ? <HostUpdatesManager updates={updates} /> : failed;
  } else {
    const questions = await listQuestionsForAdmin(scope).catch(() => null);
    content = questions ? <><p className="mb-5 text-sm leading-6 text-[#202523]/65">Guests send questions from your published Event Hub. Answer them here, then choose whether to share the question and answer. Unanswered questions and guest names stay private. This is not a custom RSVP questionnaire.</p><HostQuestionsManager questions={questions} /></> : failed;
  }
  return <EventHubContent id={id} title={draft.title} timeZone={draft.timeZone} slug={slug} view={view} enabled={settings.settings.features[view]} features={settings.settings.features} live={Boolean(live)} publishedBefore={Boolean(publication)}>{content}</EventHubContent>;
}
