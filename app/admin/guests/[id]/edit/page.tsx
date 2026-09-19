import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminGuestForm } from "../../../../../components/admin/admin-guest-form";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { getRsvpForAdmin } from "../../../../../lib/server/rsvps";

export const metadata: Metadata = {
  title: "Edit RSVP | Shindig",
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EditAdminGuestPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAdminGuestPage({
  params,
}: EditAdminGuestPageProps) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const rsvp = await getRsvpForAdmin(id);
  if (!rsvp) notFound();

  return <AdminGuestForm mode="edit" rsvp={rsvp} />;
}
