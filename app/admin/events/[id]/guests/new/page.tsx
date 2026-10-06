import { EventGuestEditorPage } from "../../../../../../components/admin/event-guest-editor-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Add Guest | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function NewGuestPage({ params }: { params: Promise<{ id: string }> }) {
  return <EventGuestEditorPage id={(await params).id} />;
}
