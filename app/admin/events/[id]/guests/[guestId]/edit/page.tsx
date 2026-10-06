import { EventGuestEditorPage } from "../../../../../../../components/admin/event-guest-editor-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit RSVP | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function EditGuestPage({ params }: { params: Promise<{ id: string; guestId: string }> }) {
  return <EventGuestEditorPage {...await params} />;
}
