import { isDraftId, isDraftRevision } from "./event-drafts";

export type InviteeFields = { guestName: string; email: string | null; phone: string | null; invited: boolean };
export type InvitationChange =
  | ({ kind: "save"; id: string; revision: number } & InviteeFields)
  | { kind: "sent"; id: string; revision: number; invited: boolean }
  | { kind: "link"; id: string; revision: number; rsvpId: string; confirmed: true }
  | { kind: "unlink"; id: string; revision: number }
  | { kind: "remove"; id: string; revision: number; confirmed: true };
export type TrackerResponse = { id: string; guestName: string; attending: boolean; partySize: number | null };
export type Invitee = InviteeFields & { id: string; revision: number; response: TrackerResponse | null };
export type InvitationTracker = { invitees: Invitee[]; responses: TrackerResponse[] };
export type InvitationFilter = "all" | "not-sent" | "waiting" | "responded";
export const invitationStatus = (entry: Invitee): Exclude<InvitationFilter, "all"> => entry.response ? "responded" : entry.invited ? "waiting" : "not-sent";
export const INVITATION_STATUS_LABELS = { "not-sent": "Not sent", waiting: "Waiting for RSVP", responded: "Responded" };

export function filterInvitees(entries: Invitee[], filter: InvitationFilter, query: string) {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (filter === "all" || invitationStatus(entry) === filter) &&
    [entry.guestName, entry.email, entry.phone].some(text => text?.toLocaleLowerCase().includes(term)));
}

// This validates host-entered contact syntax only. It never creates permission
// records or opts anyone into guest updates, even if extra fields are submitted.
export function validateInvitationChange(input: unknown): { ok: true; change: InvitationChange } | { ok: false; message: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please check this invitee and try again." };
  const v = input as Record<string, unknown>;
  if (!isDraftId(v.id) || !isDraftRevision(v.revision) || (v.kind !== "save" && v.revision === 0)) return { ok: false, message: "Please refresh the invitation tracker before making changes." };
  const base = { id: v.id.toLowerCase(), revision: v.revision };
  if (v.kind === "remove" && v.confirmed === true) return { ok: true, change: { ...base, kind: "remove", confirmed: true } };
  if (v.kind === "unlink") return { ok: true, change: { ...base, kind: "unlink" } };
  if (v.kind === "link" && isDraftId(v.rsvpId) && v.confirmed === true) return { ok: true, change: { ...base, kind: "link", rsvpId: v.rsvpId.toLowerCase(), confirmed: true } };
  if (v.kind === "sent" && typeof v.invited === "boolean") return { ok: true, change: { ...base, kind: "sent", invited: v.invited } };
  if (v.kind !== "save") return { ok: false, message: "Please check the selection and confirm this change." };
  if (typeof v.guestName !== "string" || !v.guestName.trim() || v.guestName.length > 120 || /[\u0000-\u001f\u007f]/.test(v.guestName)) return { ok: false, message: "Enter a name or household name of up to 120 characters." };
  if (typeof v.invited !== "boolean") return { ok: false, message: "Choose whether you’ve sent the invitation." };
  if ((v.email !== null && (typeof v.email !== "string" || v.email.length > 254)) || (v.phone !== null && (typeof v.phone !== "string" || v.phone.length > 40))) return { ok: false, message: "Please check the optional contact details." };
  const email = (v.email as string | null)?.trim().toLowerCase() || null;
  if (email && ((v.email as string).length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email))) return { ok: false, message: "Enter a valid email address, or leave it blank." };
  let phone = (v.phone as string | null)?.trim() || null;
  if (phone) {
    if ((v.phone as string).length > 40 || !/^[+\d ()-]+$/.test(phone)) return { ok: false, message: "Enter a valid phone number, or leave it blank." };
    phone = phone.replace(/[ ()-]/g, "");
    if (/^\d{10}$/.test(phone)) phone = `+1${phone}`;
    else if (/^1\d{10}$/.test(phone)) phone = `+${phone}`;
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return { ok: false, message: "Use a phone number with country code, such as +1 904 555 0123." };
  }
  return { ok: true, change: { ...base, kind: "save", guestName: v.guestName.trim(), email, phone, invited: v.invited } };
}

export function invitationReminder(title: string, invitationUrl: string) {
  return `Hi! A little reminder about ${title}. When you have a moment, please let me know if you can make it: ${invitationUrl}\nIf you’ve already replied, thank you — no need to RSVP again!`;
}
