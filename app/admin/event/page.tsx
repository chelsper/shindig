import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EventHeaderEditor } from "../../../components/admin/event-header-editor";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { getEventHubHeaderSettings } from "../../../lib/server/event-hub-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event Header | Shindig",
  robots: { index: false, follow: false },
};

export default async function AdminEventPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const settings = await getEventHubHeaderSettings();

  return (
    <EventHeaderEditor
      initialSettings={settings}
      uploadConfigured={Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())}
    />
  );
}
