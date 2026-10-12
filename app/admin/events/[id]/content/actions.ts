"use server";
import { revalidatePath } from "next/cache";
import { isHostAuthenticated } from "../../../../../lib/server/host-access";
import { getDraftSettings, saveDraftSettingsRecord } from "../../../../../lib/server/event-draft-settings";
import { isDraftId, isDraftRevision } from "../../../../../lib/event-drafts";
import { isHubContentView } from "../../../../../lib/event-hub-content";

type Result = { ok: true; revision: number; enabled: boolean } | { ok: false; message: string; conflict?: boolean };
// A narrow draft-only write. Never accept replacement settings or publication
// data from the browser, and never publish unrelated saved edits as a shortcut.
export async function saveHubSectionVisibility(input: unknown): Promise<Result> {
  if (!(await isHostAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before saving." };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please check the section setting." };
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 4 || !isDraftId(row.id) || !isDraftRevision(row.revision) || !isHubContentView(row.section) || typeof row.enabled !== "boolean") {
    return { ok: false, message: "Please reopen this Hub section before saving." };
  }
  const conflict: Result = { ok: false, conflict: true, message: "The saved settings changed or this event is no longer available. Reload this section before trying again." };
  try {
    // The reader and writer both enforce event ownership. The revision check
    // also protects RSVP rules and other flags edited in a second tab.
    const current = await getDraftSettings(row.id);
    if (!current || current.revision !== row.revision) return conflict;
    const revision = await saveDraftSettingsRecord(row.id, row.revision, {
      ...current.settings, features: { ...current.settings.features, [row.section]: row.enabled },
    });
    if (revision === null) return conflict;
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${row.id}`, "layout");
    return { ok: true, revision, enabled: row.enabled };
  } catch {
    console.error("Hub section setting save could not be confirmed.");
    return { ok: false, message: "We couldn’t confirm the save. Your live event hasn’t changed. Please reload this section to check the saved setting." };
  }
}
