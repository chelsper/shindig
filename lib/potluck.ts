import { isValidRsvpEditToken } from "./rsvp-edit-token";
import { isPublicKey } from "./guest-interactions";

export const POTLUCK_LIMITS = { title: 100, note: 500, guestName: 120, needed: 100, quantity: 20, items: 50 } as const;
export type PublicPotluckItem = { key: string; title: string; note: string; needed: number; claimed: number };
export type PotluckClaim = { itemKey: string; title: string; guestName: string; quantity: number; revision: number; archived: boolean };
export type HostPotluckItem = PublicPotluckItem & { revision: number; archived: boolean; claims: { id: string; guestName: string; quantity: number }[] };
export type PotluckItemInput = { key: string; title: string; note: string; needed: number; revision: number; archived: boolean };
export type PotluckClaimInput = { itemKey: string; editToken: string; guestName: string; quantity: number; revision: number };
export type PotluckResult<T> = { ok: true; data: T } | { ok: false; message: string };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const text = (v: unknown, max: number, multiline = false) => typeof v === "string" && v.length <= max && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(v);
export function validatePotluckItem(input: unknown): PotluckResult<PotluckItemInput> {
  if (!record(input) || !isPublicKey(input.key) || !integer(input.revision, 0, 2147483646) || typeof input.archived !== "boolean") return { ok: false, message: "Refresh the list and try again." };
  if (!text(input.title, POTLUCK_LIMITS.title) || !(input.title as string).trim()) return { ok: false, message: "Give this item a short name, up to 100 characters." };
  if (!text(input.note, POTLUCK_LIMITS.note, true)) return { ok: false, message: "Keep the item note under 500 characters." };
  if (!integer(input.needed, 1, POTLUCK_LIMITS.needed)) return { ok: false, message: "Choose a quantity from 1 to 100." };
  return { ok: true, data: { key: input.key, title: (input.title as string).trim(), note: (input.note as string).trim(), needed: input.needed, revision: input.revision, archived: input.archived } };
}
export function validatePotluckClaim(input: unknown, cancel = false): PotluckResult<PotluckClaimInput> {
  if (!record(input) || !isPublicKey(input.itemKey) || !isValidRsvpEditToken(input.editToken) || !integer(input.revision, 0, 2147483646)) return { ok: false, message: "Please reopen your private signup link or refresh the event." };
  if (!cancel && (!text(input.guestName, POTLUCK_LIMITS.guestName) || !(input.guestName as string).trim())) return { ok: false, message: "Please enter your name, up to 120 characters." };
  if (!cancel && !integer(input.quantity, 1, POTLUCK_LIMITS.quantity)) return { ok: false, message: "Choose a quantity from 1 to 20." };
  return { ok: true, data: { itemKey: input.itemKey, editToken: input.editToken, guestName: cancel ? "" : (input.guestName as string).trim(), quantity: cancel ? 0 : input.quantity as number, revision: input.revision } };
}
export function potluckMessage(status: string) {
  return ({ full: "Someone just filled those spots. Refresh the list and choose a smaller quantity or another item.", conflict: "This signup changed. Reload before making another change.", below_claimed: "The quantity can’t be lower than what guests have already signed up to bring.", limit: "Keep this list to 50 items. Reuse an existing item instead.", throttled: "A few too many signups just now. Please try again in a minute.", missing: "This item or signup is no longer available.", closed: "This item is no longer accepting signups. You can still cancel an existing signup." } as Record<string, string>)[status] ?? "We couldn’t save that change. Please try again shortly.";
}
