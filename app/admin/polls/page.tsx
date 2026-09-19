import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { HostPollsManager } from "../../../components/admin/host-polls-manager";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listPollsForAdmin } from "../../../lib/server/polls";
import type { AdminPoll } from "../../../lib/polls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Polls | Shindig", robots: { index: false, follow: false } };
export default async function AdminPollsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  let polls: AdminPoll[] | null = null;
  try { polls = await listPollsForAdmin(); } catch { console.error("Admin polls retrieval failed."); }
  return <ContentShell title="Polls" description="A little important research. Create questions, choose when to open them, and see what your guests think.">
    {polls === null ? <p role="alert" className="py-8 text-center text-sm">Polls couldn’t load. Please refresh and try again.</p> : <HostPollsManager polls={polls} />}
  </ContentShell>;
}
