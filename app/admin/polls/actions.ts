"use server";
import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { changePollStatus, savePoll } from "../../../lib/server/polls";
import { validatePoll } from "../../../lib/server/poll-validation";
import { isPublicKey, type InteractionResult } from "../../../lib/guest-interactions";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";

const expired = { ok: false as const, message: "Your host session has expired. Please sign in again." };
function refresh() { revalidatePath("/admin/polls"); revalidatePath(OYSTER_ROAST_EVENT.eventHub.path); }

export async function saveHostPoll(key: unknown, input: unknown, create: unknown): Promise<InteractionResult<null>> {
  if (!(await isAdminAuthenticated())) return expired;
  if (!isPublicKey(key) || typeof create !== "boolean") return { ok: false, message: "Please refresh and try again." };
  const validation = validatePoll(input);
  if (!validation.ok) return validation;
  try {
    if (!(await savePoll(key, validation.data, create))) return { ok: false, message: "This poll changed. Once voting begins, keep the same options and voting rules. Refresh and try again." };
    refresh();
    return { ok: true, data: null };
  } catch { return { ok: false, message: "We couldn’t save the poll. Please check the options and try again." }; }
}

export async function setHostPollStatus(key: unknown, status: unknown, confirmed = false): Promise<InteractionResult<null>> {
  if (!(await isAdminAuthenticated())) return expired;
  if (!isPublicKey(key) || typeof status !== "string" || !["OPEN", "CLOSED", "ARCHIVED", "DELETE_DRAFT"].includes(status)) return { ok: false, message: "Please choose a valid poll action." };
  if (status === "DELETE_DRAFT" && confirmed !== true) return { ok: false, message: "Please confirm you want to delete this draft." };
  try {
    if (!(await changePollStatus(key, status as "OPEN" | "CLOSED" | "ARCHIVED" | "DELETE_DRAFT"))) return { ok: false, message: "This poll changed or can’t be deleted. Refresh to see its current status." };
    refresh();
    return { ok: true, data: null };
  } catch { return { ok: false, message: "We couldn’t update this poll. Please try again." }; }
}
