"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearAdminSession,
  createAdminSession,
  isAdminConfigured,
  isAdminAuthenticated,
  verifyAdminPassword,
} from "../../lib/server/admin-session";
import {
  createRsvpForAdmin,
  deleteRsvpForAdmin,
  updateRsvpForAdmin,
} from "../../lib/server/rsvps";
import { validateRsvpUpdate } from "../../lib/server/rsvp-validation";

export type AdminLoginState = {
  error: string | null;
};

export type AdminGuestActionState = {
  error: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAuthenticatedAdmin() {
  if (!(await isAdminAuthenticated())) redirect("/admin");
}

function parseGuestForm(formData: FormData) {
  const attendingValue = formData.get("attending");

  if (attendingValue !== "true" && attendingValue !== "false") {
    return { success: false as const, message: "Please choose an RSVP status." };
  }

  const attending = attendingValue === "true";
  const partySizeValue = formData.get("partySize");
  const partySize =
    attending && typeof partySizeValue === "string"
      ? Number(partySizeValue)
      : null;

  return validateRsvpUpdate({
    guestName: formData.get("guestName"),
    attending,
    partySize,
    displayOnGuestList:
      attending && formData.get("displayOnGuestList") === "on",
    comment: formData.get("comment"),
  });
}

function logAdminMutationFailure(operation: string, error: unknown) {
  const databaseError =
    error && typeof error === "object"
      ? (error as { code?: string; name?: string })
      : {};
  console.error(`Admin RSVP ${operation} failed.`, {
    code: databaseError.code ?? "unknown",
    name: databaseError.name ?? "unknown",
  });
}

function refreshRsvpViews() {
  revalidatePath("/admin");
  revalidatePath("/event");
}

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

export async function createAdminGuest(
  _previousState: AdminGuestActionState,
  formData: FormData,
): Promise<AdminGuestActionState> {
  await requireAuthenticatedAdmin();
  const validation = parseGuestForm(formData);

  if (!validation.success) return { error: validation.message };

  try {
    await createRsvpForAdmin(randomUUID(), validation.data);
  } catch (error) {
    logAdminMutationFailure("creation", error);
    return { error: "We couldn’t add that guest. Please try again." };
  }

  refreshRsvpViews();
  redirect("/admin");
}

export async function updateAdminGuest(
  id: string,
  _previousState: AdminGuestActionState,
  formData: FormData,
): Promise<AdminGuestActionState> {
  await requireAuthenticatedAdmin();

  if (!UUID_PATTERN.test(id)) {
    return { error: "That RSVP could not be found." };
  }

  const validation = parseGuestForm(formData);
  if (!validation.success) return { error: validation.message };

  try {
    const updated = await updateRsvpForAdmin(id, validation.data);
    if (!updated) return { error: "That RSVP could not be found." };
  } catch (error) {
    logAdminMutationFailure("update", error);
    return { error: "We couldn’t update that RSVP. Please try again." };
  }

  refreshRsvpViews();
  redirect("/admin");
}

export async function deleteAdminGuest(
  id: string,
  _previousState: AdminGuestActionState,
  _formData: FormData,
): Promise<AdminGuestActionState> {
  void _previousState;
  void _formData;
  await requireAuthenticatedAdmin();

  if (!UUID_PATTERN.test(id)) {
    return { error: "That RSVP could not be found." };
  }

  try {
    const deleted = await deleteRsvpForAdmin(id);
    if (!deleted) return { error: "That RSVP could not be found." };
  } catch (error) {
    logAdminMutationFailure("deletion", error);
    return { error: "We couldn’t delete that RSVP. Please try again." };
  }

  refreshRsvpViews();
  redirect("/admin");
}
