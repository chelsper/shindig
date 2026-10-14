"use server";
import { isValidRsvpEditToken } from "../../lib/rsvp-edit-token";
import { validateContactPreferences, type GuestContactPreferences } from "../../lib/rsvp-contacts";
import { hashRsvpEditToken } from "../../lib/server/rsvp-edit-token";
import { resolvePublicEventScope } from "../../lib/server/event-scope";
import { saveGuestContactPreferences } from "../../lib/server/rsvp-contacts";
import { RsvpAdmissionError } from "../../lib/rsvp-policy";

// Contact preferences remain editable after RSVP closure/deadline. This action
// cannot alter attendance, public visibility, comments, or any other RSVP.
export async function updateContactPreferences(slug: string, token: string, input: unknown): Promise<
  { ok: true; preferences: GuestContactPreferences } | { ok: false; message: string }> {
  if (!isValidRsvpEditToken(token)) return { ok: false, message: "This private update link is not available." };
  const parsed = validateContactPreferences(input);
  if (!parsed.success) return { ok: false, message: parsed.message };
  try {
    const scope = await resolvePublicEventScope(slug);
    if (!scope) return { ok: false, message: "This event is not available." };
    const preferences = await saveGuestContactPreferences(hashRsvpEditToken(token), parsed.data, scope);
    return preferences ? { ok: true, preferences } : { ok: false, message: "This private update link is not available." };
  } catch (error) {
    return { ok: false, message: error instanceof RsvpAdmissionError ? error.message : "We couldn’t save your update preferences. Please try again." };
  }
}
