"use server";
import type { SubmitRsvpResult } from "../actions";
import type { UpdateRsvpResult } from "../rsvp/actions";
import { resolvePublicEventScope } from "../../lib/server/event-scope";
import { isValidRsvpEditToken } from "../../lib/rsvp-edit-token";
import { hashRsvpEditToken } from "../../lib/server/rsvp-edit-token";
import { validateRsvpSubmission, validateRsvpUpdate } from "../../lib/server/rsvp-validation";
import { saveRsvp, updateRsvpForGuest } from "../../lib/server/rsvps";
import { RSVP_CLOSED_MESSAGE } from "../../lib/event-lifecycle";

export async function submitEventRsvp(slug: string, input: unknown): Promise<SubmitRsvpResult> {
  try {
    const scope = await resolvePublicEventScope(slug);
    if (!scope) return { ok: false, message: "This event is not available." };
    if (!scope.rsvpsOpen) return { ok: false, message: RSVP_CLOSED_MESSAGE };
    const parsed = validateRsvpSubmission(input, { slug: scope.slug, rules: { ...scope.rsvp, guestListEnabled: scope.features.guestList } });
    if (!parsed.success) return { ok: false, message: parsed.message };
    const token = (input as Record<string, unknown>).editToken;
    if (!isValidRsvpEditToken(token)) return { ok: false, message: "Please refresh and try again." };
    const result = await saveRsvp(parsed.data, hashRsvpEditToken(token), scope);
    if (result.status === "disabled") return { ok: false, message: "RSVPs are temporarily unavailable. Please try again shortly." };
    return { ok: true, persisted: true, rsvp: result.rsvp, editToken: token };
  } catch { return { ok: false, message: "We couldn’t save your RSVP. Please try again in a moment." }; }
}
export async function updateEventRsvp(slug: string, input: unknown): Promise<UpdateRsvpResult> {
  try {
    const scope = await resolvePublicEventScope(slug);
    if (!scope) return { ok: false, message: "This event is not available." };
    if (!scope.rsvpsOpen) return { ok: false, message: RSVP_CLOSED_MESSAGE };
    const token = input && typeof input === "object" ? (input as Record<string, unknown>).editToken : null;
    if (!isValidRsvpEditToken(token)) return { ok: false, message: "This private update link is not available." };
    const parsed = validateRsvpUpdate(input, { ...scope.rsvp, guestListEnabled: scope.features.guestList });
    if (!parsed.success) return { ok: false, message: parsed.message };
    const rsvp = await updateRsvpForGuest(hashRsvpEditToken(token), parsed.data, scope);
    return rsvp ? { ok: true, rsvp } : { ok: false, message: "This private update link is not available." };
  } catch { return { ok: false, message: "We couldn’t update your RSVP. Please try again in a moment." }; }
}
