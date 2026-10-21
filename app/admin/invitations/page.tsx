import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { InvitationTrackerPanel } from "../../../components/admin/invitation-tracker";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listInvitationTracker } from "../../../lib/server/invitation-tracker";
import { getEventConfiguration } from "../../../lib/server/invitation-settings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation tracker | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function InvitationsPage({ searchParams }: { searchParams?: Promise<{ response?: string }> } = {}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const result = await Promise.all([listInvitationTracker(), getEventConfiguration()]).catch(() => null);
  const requested = (await searchParams)?.response;
  const initialResponseId = result?.[0].responses.find(r => r.id === requested)?.id;
  return <ContentShell title="Invitation tracker" description="A private list of who you’re inviting, who you’ve reached out to, and who has replied.">
    {result ? <InvitationTrackerPanel initial={result[0]} initialResponseId={initialResponseId} title={result[1].title} invitationUrl={result[1].websiteUrl} /> : <p role="alert">The invitation tracker couldn’t load. Please refresh and try again.</p>}
  </ContentShell>;
}
