"use server";

import { revalidatePath } from "next/cache";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { isContentId, validateHostUpdate } from "../../../lib/server/event-content-validation";
import { insertHostUpdate, removeHostUpdate, updateHostUpdate } from "../../../lib/server/updates";

export type HostContentResult = { ok: true } | { ok: false; message: string };
const expired = { ok: false as const, message: "Your host session has expired. Please sign in again." };

function refreshUpdates() {
  revalidatePath("/admin/updates");
  revalidatePath(OYSTER_ROAST_EVENT.eventHub.path);
}

export async function createHostUpdate(id: string, input: unknown): Promise<HostContentResult> {
  if (!(await isAdminAuthenticated())) return expired;
  if (!isContentId(id)) return { ok: false, message: "Please refresh and try again." };
  const validation = validateHostUpdate(input);
  if (!validation.success) return { ok: false, message: validation.message };
  try {
    await insertHostUpdate(id, validation.data);
  } catch {
    console.error("Host update creation failed.");
    return { ok: false, message: "We couldn’t publish your update. Please try again." };
  }
  refreshUpdates();
  return { ok: true };
}

export async function editHostUpdate(id: string, input: unknown): Promise<HostContentResult> {
  if (!(await isAdminAuthenticated())) return expired;
  if (!isContentId(id)) return { ok: false, message: "That update could not be found." };
  const validation = validateHostUpdate(input);
  if (!validation.success) return { ok: false, message: validation.message };
  try {
    if (!(await updateHostUpdate(id, validation.data))) return { ok: false, message: "That update could not be found." };
  } catch {
    console.error("Host update editing failed.");
    return { ok: false, message: "We couldn’t save your update. Please try again." };
  }
  refreshUpdates();
  return { ok: true };
}

export async function deleteHostUpdate(id: string, confirmed: boolean): Promise<HostContentResult> {
  if (!(await isAdminAuthenticated())) return expired;
  if (!isContentId(id) || confirmed !== true) return { ok: false, message: "Please confirm which update to delete." };
  try {
    await removeHostUpdate(id);
  } catch {
    console.error("Host update deletion failed.");
    return { ok: false, message: "We couldn’t delete that update. Please try again." };
  }
  refreshUpdates();
  return { ok: true };
}
