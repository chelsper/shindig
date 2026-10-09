"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { guestEventScope, guestFeatureEnabled, guestHubPath } from "../../lib/server/guest-event";
import { potluckMessage, validatePotluckClaim, type PotluckClaim, type PotluckResult } from "../../lib/potluck";
import { potluckRequesterHash, writePotluckClaim } from "../../lib/server/potluck";

export async function saveGuestPotluckClaim(operation: "create" | "update" | "cancel", input: unknown, eventSlug: string): Promise<PotluckResult<PotluckClaim>> {
  try {
    if (!["create", "update", "cancel"].includes(operation) || typeof eventSlug !== "string") return { ok: false, message: "Please refresh and try again." };
    const scope = await guestEventScope(eventSlug);
    if (!scope || !guestFeatureEnabled(scope, "potluck")) return { ok: false, message: "Bring-something signups aren’t available for this event right now." };
    const parsed = validatePotluckClaim(input, operation === "cancel");
    if (!parsed.ok) return parsed;
    const result = await writePotluckClaim(operation, parsed.data, potluckRequesterHash(await headers()), scope);
    if (result.status !== "saved" || !result.claim) return { ok: false, message: potluckMessage(result.status) };
    revalidatePath(guestHubPath(scope));
    revalidatePath(`/admin/events/${scope.slug.slice(6)}/guests`);
    // Only the holder of this 256-bit capability receives their own claim.
    return { ok: true, data: result.claim };
  } catch { return { ok: false, message: "We couldn’t confirm your signup. Please try again; retrying won’t reserve extra spots." }; }
}
