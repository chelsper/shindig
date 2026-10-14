import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../app/rsvp/contact-actions", () => ({ updateContactPreferences: vi.fn() }));
vi.mock("../app/admin/contacts/actions", () => ({ refreshContacts: vi.fn(), cleanUpContacts: vi.fn() }));
import { EMPTY_CONTACT_PREFERENCES, CONTACT_PERMISSION_COPY, validateContactPreferences } from "../lib/rsvp-contacts";
import { validateRsvpSubmission, validateRsvpUpdate } from "../lib/server/rsvp-validation";
import { ContactPreferencesFields } from "../components/rsvp/contact-preferences-fields";
import { ContactPreferencesForm } from "../components/rsvp/contact-preferences-form";
import { HostContactsPanel } from "../components/admin/host-contacts";
const email = { ...EMPTY_CONTACT_PREFERENCES, emailOptIn: true, email: " Test@Example.COM " };
describe("optional event contact preferences", () => {
  it("defaults to neither channel and ignores unsanctioned stale contact values", () => {
    expect(validateContactPreferences({ ...EMPTY_CONTACT_PREFERENCES, email: "secret@example.com", phone: "+19045550123" })).toEqual({ success: true, data: { emailOptIn: false, textOptIn: false, email: null, phone: null, revision: 0 } });
  });
  it("normalizes email and US/international telephone numbers", () => {
    expect(validateContactPreferences(email)).toMatchObject({ success: true, data: { email: "test@example.com" } });
    for (const [phone, expected] of [["(904) 555-0123", "+19045550123"], ["1 904 555 0123", "+19045550123"], ["+44 20 7946 0123", "+442079460123"]]) {
      expect(validateContactPreferences({ ...EMPTY_CONTACT_PREFERENCES, textOptIn: true, phone })).toMatchObject({ success: true, data: { phone: expected } });
    }
  });
  it.each([null, [], {}, { ...email, emailOptIn: "true" }, { ...email, revision: -1 }, { ...email, revision: 1.2 }, { ...email, revision: 2147483647 }, { ...email, email: "no-at-sign" }, { ...email, email: "x@y.com\r\nBcc:evil@example.com" }, { ...email, email: "a".repeat(255)+"@example.com" }, { ...email, email: "a@example.com,evil@example.com" }, { ...email, textOptIn: true, phone: "911" }, { ...email, textOptIn: true, phone: "+1;evil" }, { ...email, textOptIn: true, phone: "+1234567890123456" }])("rejects malformed opt-ins %#", input => {
    expect(validateContactPreferences(input).success).toBe(false);
  });
  it("preserves the original RSVP contract and validates supplied preferences", () => {
    const fields = { guestName: " Guest ", attending: false, partySize: 20, comment: "" };
    expect(validateRsvpUpdate(fields)).toMatchObject({ success: true, data: { guestName: "Guest", partySize: null } });
    expect(validateRsvpUpdate({ ...fields, contactPreferences: email })).toMatchObject({ success: true, data: { contactPreferences: { email: "test@example.com" } } });
    expect(validateRsvpSubmission({ ...fields, eventSlug: "oyster-roast-2026", submissionId: "4f849d18-931b-42ef-a4d4-7ec07aa73b3d", contactPreferences: { ...email, email: "" } }).success).toBe(false);
  });
  it("renders unchecked optional choices without contact inputs initially", () => {
    const html = renderToStaticMarkup(<ContactPreferencesFields value={EMPTY_CONTACT_PREFERENCES} onChange={() => {}} />);
    expect(html).toContain("(optional)"); expect(html).toContain(CONTACT_PERMISSION_COPY);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2); expect(html).not.toContain("checked=");
    expect(html).not.toContain('type="email"'); expect(html).not.toContain('type="tel"');
    expect(html).toContain("won’t send messages automatically");
  });
  it("shows required bounded channel fields only when selected and disables pending controls", () => {
    const html = renderToStaticMarkup(<ContactPreferencesFields value={{ ...email, textOptIn: true }} onChange={() => {}} disabled />);
    expect(html).toContain('maxLength="254"'); expect(html).toContain('maxLength="40"');
    expect(html.match(/required=""/g)).toHaveLength(2); expect(html).toContain('fieldset disabled=""');
  });
  it("lets contacts be managed independently of closed RSVPs and explains cleanup", () => {
    const html = renderToStaticMarkup(<ContactPreferencesForm initial={EMPTY_CONTACT_PREFERENCES} eventSlug="oyster-roast-2026" token={'a'.repeat(43)} />);
    expect(html).toContain("even when RSVP replies are closed"); expect(html).toContain("Save update preferences");
    const closed = renderToStaticMarkup(<ContactPreferencesForm initial={{ ...EMPTY_CONTACT_PREFERENCES, collectionClosed: true }} eventSlug="oyster-roast-2026" token={'a'.repeat(43)} />);
    expect(closed).toContain("Contact collection has ended"); expect(closed).not.toContain("<input"); expect(closed).not.toContain("Save update preferences");
  });
  it("shows a host-only, manual workflow with recipient privacy guidance and gated cleanup", () => {
    const html = renderToStaticMarkup(<HostContactsPanel initial={{ contacts: [], collectionClosed: false }} title="Garden Supper" />);
    expect(html).toContain("Use Bcc for email"); expect(html).toContain("group texts can reveal"); expect(html).toContain("not verified");
    expect(html).toContain("No guests have shared contact details"); expect(html).toContain("Copy message"); expect(html).not.toContain("Send message");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Clear event contacts<\/button>/);
  });
});
