"use server";

import { revalidatePath } from "next/cache";

import { validateEventHubHeaderSettings } from "../../../lib/event-hub-settings";
import { isAdminAuthenticated } from "../../../lib/server/admin-session";
import { saveEventHubHeaderSettings as saveHeaderSettings } from "../../../lib/server/event-hub-settings";

export type EventHeaderActionState = {
  error: string | null;
  success: boolean;
};

export async function saveEventHeaderSettings(
  _previousState: EventHeaderActionState,
  formData: FormData,
): Promise<EventHeaderActionState> {
  if (!(await isAdminAuthenticated())) {
    return {
      error: "Your host session has expired. Sign in again before saving.",
      success: false,
    };
  }

  const validation = validateEventHubHeaderSettings({
    imageUrl: formData.get("imageUrl"),
    imageAlt: formData.get("imageAlt"),
    focalX: formData.get("focalX"),
    focalY: formData.get("focalY"),
    zoomPercent: formData.get("zoomPercent"),
  });

  if (!validation.success) {
    return { error: validation.message, success: false };
  }

  try {
    await saveHeaderSettings(validation.data);
  } catch (error) {
    const databaseError =
      error && typeof error === "object"
        ? (error as { code?: string; name?: string })
        : {};
    console.error("Event Hub header update failed.", {
      code: databaseError.code ?? "unknown",
      name: databaseError.name ?? "unknown",
    });
    return {
      error: "We couldn’t save the header. Please try again.",
      success: false,
    };
  }

  revalidatePath("/event");
  revalidatePath("/admin/event");

  return { error: null, success: true };
}
