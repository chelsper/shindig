"use server";
import { revalidatePath } from "next/cache";
import { isHostAuthenticated } from "../../../../lib/server/host-access";
import { duplicateEventRecord } from "../../../../lib/server/event-duplication";
import { EventDuplicationError, validateDuplicateEventInput } from "../../../../lib/event-duplication";

export async function duplicateEvent(input: unknown): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!(await isHostAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before copying." };
  const parsed = validateDuplicateEventInput(input);
  if (!parsed) return { ok: false, message: "Please check the new event name and confirm that you want a private copy." };
  try {
    const id = await duplicateEventRecord(parsed);
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${id}`, "layout");
    return { ok: true, id };
  } catch (error) {
    if (error instanceof EventDuplicationError) return { ok: false, message: error.message };
    console.error("Event copy could not be confirmed.");
    return { ok: false, message: "We couldn’t confirm the copy. Retry here safely to check or finish the same copy. Your original event hasn’t changed." };
  }
}
