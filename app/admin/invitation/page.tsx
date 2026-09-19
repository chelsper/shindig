import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentShell } from "../../../components/admin/content-shell";
import { InvitationEditor } from "../../../components/admin/invitation-editor";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { getInvitationSettings } from "../../../lib/server/invitation-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit Invitation | Shindig", robots: { index: false, follow: false } };

export default async function AdminInvitationPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  let record;
  try { record = await getInvitationSettings(); }
  catch {
    return <ContentShell title="Invitation" description="Edit the invitation guests see before they RSVP.">
      <p role="alert" className="rounded-2xl bg-white/60 p-6 text-sm leading-6">The invitation editor couldn’t load. Please try again shortly. If this is the first setup, apply migration 009 to the database first.</p>
    </ContentShell>;
  }
  return <InvitationEditor initialRecord={record} uploadConfigured={Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())} />;
}
