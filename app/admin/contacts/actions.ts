"use server";
import { revalidatePath } from "next/cache";
import { hostScopeArgs, refreshHostEvent } from "../../../lib/server/host-event";
import { clearEventContacts, listHostContacts, type HostContacts } from "../../../lib/server/rsvp-contacts";

export async function refreshContacts(slug?: string): Promise<{ ok: true; data: HostContacts } | { ok: false; message: string }> {
  try { return { ok: true, data: await listHostContacts(...await hostScopeArgs(slug)) }; }
  catch { return { ok: false, message: "Contacts couldn’t load. Check your host session and try again." }; }
}
export async function cleanUpContacts(confirmed: boolean, slug?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (confirmed !== true) return { ok: false, message: "Please confirm contact cleanup first." };
  try {
    await clearEventContacts(...await hostScopeArgs(slug));
    revalidatePath("/admin/contacts");
    await refreshHostEvent(slug);
    return { ok: true };
  } catch { return { ok: false, message: "Contacts couldn’t be cleared. Check your host session and try again." }; }
}
