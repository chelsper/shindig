import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminGuestForm } from "../../../../components/admin/admin-guest-form";
import { isAdminAuthenticated } from "../../../../lib/server/admin-session";

export const metadata: Metadata = {
  title: "Add Guest | Shindig",
  robots: { index: false, follow: false },
};

export default async function NewAdminGuestPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  return <AdminGuestForm mode="create" />;
}
