"use server";

import { revalidatePath } from "next/cache";

import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { deletePlaylistSuggestion } from "../../../lib/server/playlist";

export type DeletePlaylistState = { error: string | null };

export async function deleteAdminPlaylistSuggestion(
  id: string,
  _previousState: DeletePlaylistState,
  formData: FormData,
): Promise<DeletePlaylistState> {
  if (!(await isAdminAuthenticated())) {
    return { error: "Your host session has expired. Sign in again before deleting." };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { error: "That suggestion could not be found." };
  }
  if (formData.get("confirm") !== "delete") {
    return { error: "Please confirm you want to delete this suggestion." };
  }
  try {
    await deletePlaylistSuggestion(id);
  } catch {
    console.error("Admin playlist deletion failed.");
    return { error: "We couldn’t delete that suggestion. Please try again." };
  }
  revalidatePath("/admin/playlist");
  revalidatePath(OYSTER_ROAST_EVENT.eventHub.path);
  return { error: null };
}
