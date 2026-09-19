import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { HostUpdatesManager } from "../../../components/admin/host-updates-manager";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { listHostUpdatesForAdmin, type AdminHostUpdate } from "../../../lib/server/updates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host Updates | Shindig", robots: { index: false, follow: false } };

export default async function AdminUpdatesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  let updates: AdminHostUpdate[] | null = null;
  try { updates = await listHostUpdatesForAdmin(); } catch { console.error("Admin updates retrieval failed."); }
  return (
    <ContentShell title="Host Updates" description="Share a little news with your guests. Published updates appear newest first on the Event Hub.">
      {updates === null ? <p className="py-8 text-center text-sm" role="alert">Updates couldn’t load. Please refresh and try again.</p> : <HostUpdatesManager updates={updates} />}
    </ContentShell>
  );
}
