"use server";
import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "../../../../../lib/server/admin-session";
import { findDraftAddress, confirmDraftLocation } from "../../../../../lib/server/event-location";
import { LocationError, LocationConflictError } from "../../../../../lib/server/address-search";
import type { AddressMatch, ConfirmedEventLocation } from "../../../../../lib/event-location";

type Failure = { ok: false; message: string; conflict?: true };
const errorMessage = (error: unknown) => error instanceof LocationError ? error.message : "We couldn’t confirm the location. Reload this page to check before trying again. Your live event has not changed.";
const failure = (error: unknown): Failure => ({ ok: false, message: errorMessage(error), ...(error instanceof LocationConflictError ? { conflict: true as const } : {}) });
export async function findEventAddress(id: string, revision: number): Promise<{ ok: true; matches: AddressMatch[] } | Failure> {
  if (!(await isAdminAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again to find the address." };
  try { return { ok: true, matches: await findDraftAddress(id, revision) }; }
  catch (error) { return failure(error); }
}
export async function saveEventLocation(id: string, revision: number, input: unknown, confirmed: unknown): Promise<{ ok: true; revision: number; location: ConfirmedEventLocation } | Failure> {
  if (!(await isAdminAuthenticated())) return { ok: false, message: "Your host session has expired. Sign in again before saving." };
  let result;
  try { result = await confirmDraftLocation(id, revision, input, confirmed); }
  catch (error) { return failure(error); }
  // A revalidation problem must not report that an acknowledged save failed.
  try { revalidatePath("/admin/events"); revalidatePath(`/admin/events/${id}`, "layout"); } catch {}
  return { ok: true, ...result };
}
