// Shared form contract only. Contact data is loaded by private server-only readers.
export const CONTACT_PERMISSION_COPY = "Your contact details are shared only with the host for reminders and updates about this event.";
export const CONTACT_PERMISSION_VERSION = "event-updates-v1";
export type ContactPreferences = {
  emailOptIn: boolean;
  textOptIn: boolean;
  email: string | null;
  phone: string | null;
  revision: number;
};
export type GuestContactPreferences = ContactPreferences & { collectionClosed: boolean };
export const EMPTY_CONTACT_PREFERENCES: GuestContactPreferences = {
  emailOptIn: false, textOptIn: false, email: null, phone: null, revision: 0, collectionClosed: false,
};
export function validateContactPreferences(input: unknown):
  { success: true; data: ContactPreferences } | { success: false; message: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { success: false, message: "Please check your update preferences." };
  const value = input as Record<string, unknown>;
  if (typeof value.emailOptIn !== "boolean" || typeof value.textOptIn !== "boolean" ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || (value.revision as number) > 2147483646) {
    return { success: false, message: "Please refresh this page and check your update preferences." };
  }
  let email: string | null = null, phone: string | null = null;
  if (value.emailOptIn) {
    if (typeof value.email !== "string" || value.email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value.email.trim())) {
      return { success: false, message: "Please enter a valid email address, or uncheck email updates." };
    }
    email = value.email.trim().toLowerCase();
  }
  if (value.textOptIn) {
    if (typeof value.phone !== "string" || value.phone.length > 40 || !/^[+\d ()-]+$/.test(value.phone.trim())) return { success: false, message: "Please enter a phone number with country code, or uncheck text updates." };
    let number = value.phone.trim().replace(/[ ()-]/g, "");
    if (/^\d{10}$/.test(number)) number = `+1${number}`;
    else if (/^1\d{10}$/.test(number)) number = `+${number}`;
    if (!/^\+[1-9]\d{7,14}$/.test(number)) return { success: false, message: "Please enter a phone number with country code, such as +1 904 555 0123." };
    phone = number;
  }
  // Unchecked channels are erased, even when a stale/hostile client sends values.
  return { success: true, data: { emailOptIn: value.emailOptIn, textOptIn: value.textOptIn, email, phone, revision: value.revision as number } };
}
