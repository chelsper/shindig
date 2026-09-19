import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { HostQuestionsManager } from "../../../components/admin/host-questions-manager";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listQuestionsForAdmin, type AdminQuestion } from "../../../lib/server/questions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask the Host | Shindig", robots: { index: false, follow: false } };

export default async function AdminQuestionsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  let questions: AdminQuestion[] | null = null;
  try { questions = await listQuestionsForAdmin(); } catch { console.error("Admin questions retrieval failed."); }
  return (
    <ContentShell title="Ask the Host" description="Questions arrive privately. Answer just for now, or choose to share the question and answer with everyone. Guest names stay here.">
      {questions === null ? <p className="py-8 text-center text-sm" role="alert">Questions couldn’t load. Please refresh and try again.</p> : <HostQuestionsManager questions={questions} />}
    </ContentShell>
  );
}
