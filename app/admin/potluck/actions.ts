"use server";
import { potluckMessage, validatePotluckItem, type HostPotluckItem, type PotluckResult } from "../../../lib/potluck";
import { listHostPotluckItems, releaseHostPotluckClaim, saveHostPotluckItem } from "../../../lib/server/potluck";
import { refreshHostEvent } from "../../../lib/server/host-event";
import { isPublicKey } from "../../../lib/guest-interactions";

export async function savePotluckItem(input: unknown, eventSlug: string): Promise<PotluckResult<HostPotluckItem[]>> {
  const parsed = validatePotluckItem(input);
  if (!parsed.ok) return parsed;
  try {
    const status = await saveHostPotluckItem(eventSlug, parsed.data);
    if (status !== "saved") return { ok: false, message: potluckMessage(status) };
    await refreshHostEvent(eventSlug);
    return { ok: true, data: await listHostPotluckItems(eventSlug) };
  } catch { return { ok: false, message: "We couldn’t confirm that change. Check your host session and try again." }; }
}
export async function releasePotluckSignup(id: string, confirmed: boolean, eventSlug: string): Promise<PotluckResult<HostPotluckItem[]>> {
  if (!isPublicKey(id) || confirmed !== true) return { ok: false, message: "Confirm the signup you want to release." };
  try {
    if (!(await releaseHostPotluckClaim(eventSlug, id))) return { ok: false, message: "That signup is no longer available." };
    await refreshHostEvent(eventSlug);
    return { ok: true, data: await listHostPotluckItems(eventSlug) };
  } catch { return { ok: false, message: "We couldn’t release that signup. Please try again." }; }
}
