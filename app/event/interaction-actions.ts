"use server";

import { revalidatePath } from "next/cache";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { isPublicKey, type GuestInteractionState, type GuestPollState, type InteractionResult } from "../../lib/guest-interactions";
import { getGuestTokenHash } from "../../lib/server/guest-token";
import { listGuestApplause, setPlaylistApplause } from "../../lib/server/applause";
import { listGuestPollStates, setPollVote } from "../../lib/server/polls";
import { validatePollVote } from "../../lib/server/poll-validation";

const cookieError = { ok: false as const, message: "Please allow cookies for Shindig and refresh to save your choice on this browser." };
export async function loadGuestInteractions(): Promise<InteractionResult<GuestInteractionState>> {
  try {
    if (!OYSTER_ROAST_EVENT.features.playlist && !OYSTER_ROAST_EVENT.features.polls) return { ok: true, data: { applauded: [], polls: {} } };
    const hash = await getGuestTokenHash(true);
    if (!hash) return cookieError;
    const [applauded, polls] = await Promise.all([
      OYSTER_ROAST_EVENT.features.playlist ? listGuestApplause(hash) : [],
      OYSTER_ROAST_EVENT.features.polls ? listGuestPollStates(hash) : {},
    ]);
    return { ok: true, data: { applauded, polls } };
  } catch { return { ok: false, message: "Your choices couldn’t load. Please refresh to try again." }; }
}

export async function applaudSong(key: unknown, active: unknown): Promise<InteractionResult<{ count: number; active: boolean }>> {
  if (!OYSTER_ROAST_EVENT.features.playlist) return { ok: false, message: "The playlist isn’t available for this event." };
  if (!isPublicKey(key) || typeof active !== "boolean") return { ok: false, message: "Please choose a song from the playlist." };
  try {
    const hash = await getGuestTokenHash();
    if (!hash) return cookieError;
    const count = await setPlaylistApplause(key, active, hash);
    if (count === null) return { ok: false, message: "That song is no longer on the playlist." };
    revalidatePath(OYSTER_ROAST_EVENT.eventHub.path);
    revalidatePath("/admin/playlist");
    return { ok: true, data: { count, active } };
  } catch { return { ok: false, message: "Your applause didn’t save. Give it another try." }; }
}

export async function voteInPoll(key: unknown, options: unknown): Promise<InteractionResult<GuestPollState>> {
  if (!OYSTER_ROAST_EVENT.features.polls) return { ok: false, message: "Polls aren’t available for this event." };
  const validation = validatePollVote(key, options);
  if (!validation.ok) return validation;
  try {
    const hash = await getGuestTokenHash();
    if (!hash) return cookieError;
    if (!(await setPollVote(validation.data.key, validation.data.options, hash))) return { ok: false, message: "This poll has changed or closed. Refresh to see the latest choices." };
    const states = await listGuestPollStates(hash);
    revalidatePath(OYSTER_ROAST_EVENT.eventHub.path);
    revalidatePath("/admin/polls");
    return { ok: true, data: states[validation.data.key] ?? { selected: validation.data.options, results: null } };
  } catch { return { ok: false, message: "We couldn’t confirm your answer. Please try again; retrying won’t add another vote." }; }
}
