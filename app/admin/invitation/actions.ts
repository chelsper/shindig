"use server";

import { revalidatePath } from "next/cache";
import { fromEventLocalInput, validateInvitationSettings, type InvitationSettings } from "../../../lib/invitation-settings";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { getInvitationSettings, saveInvitationSettings } from "../../../lib/server/invitation-settings";

export type SaveInvitationResult = { ok: true; revision: number; settings: InvitationSettings } | { ok: false; message: string };

export async function saveInvitation(input: unknown): Promise<SaveInvitationResult> {
  if (!(await isAdminAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before saving." };
  if (!input || typeof input !== "object") return { ok: false, message: "Please check the invitation details." };
  const request = input as Record<string, unknown>;
  const revision = request.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return { ok: false, message: "Please reload the editor before saving." };
  const startsAtUtc = fromEventLocalInput(request.startsAtLocal);
  const endsAtUtc = fromEventLocalInput(request.endsAtLocal);
  if (!startsAtUtc || !endsAtUtc) return { ok: false, message: "Enter valid start and end times in America/New_York. Times skipped or repeated during daylight saving changes aren’t supported." };
  const validation = validateInvitationSettings({
    ...(request.settings && typeof request.settings === "object" ? request.settings : {}), startsAtUtc, endsAtUtc,
  });
  if (!validation.success) return { ok: false, message: validation.message };
  try {
    const current = await getInvitationSettings();
    if (current.revision !== revision) return { ok: false, message: "Someone saved changes after you opened this page. Reload the editor to see them before publishing." };
    if (current.settings.address !== validation.data.address && request.locationConfirmed !== true) {
      return { ok: false, message: "Please confirm that the weather coordinates match the new address." };
    }
    const nextRevision = await saveInvitationSettings(validation.data, revision);
    if (nextRevision === null) return { ok: false, message: "Someone else just saved this invitation. Reload the editor before publishing your changes." };
    for (const path of ["/", "/event", "/admin", "/admin/invitation", "/calendar/oyster-roast.ics", "/api/weather"]) revalidatePath(path);
    revalidatePath("/rsvp/[token]", "page");
    return { ok: true, revision: nextRevision, settings: validation.data };
  } catch {
    console.error("Invitation settings could not be saved.");
    return { ok: false, message: "We couldn’t save the invitation. Your changes haven’t been confirmed. Please try again." };
  }
}
