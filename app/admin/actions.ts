"use server";

import { redirect } from "next/navigation";

import {
  clearAdminSession,
  createAdminSession,
  isAdminConfigured,
  verifyAdminPassword,
} from "../../lib/server/admin-session";

export type AdminLoginState = {
  error: string | null;
};

export async function loginAdmin(
  _previousState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  if (!isAdminConfigured()) {
    return { error: "Host access is not configured yet." };
  }

  const password = formData.get("password");

  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    return { error: "That password isn’t correct. Please try again." };
  }

  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect("/admin");
}
