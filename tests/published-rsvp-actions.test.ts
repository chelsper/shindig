import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ publication: vi.fn(), save: vi.fn(), update: vi.fn() }));
vi.mock("../lib/server/event-publications", () => ({ getEventPublication: mocks.publication }));
vi.mock("../lib/server/rsvps", () => ({ saveRsvp: mocks.save, updateRsvpForGuest: mocks.update }));
import { submitEventRsvp, updateEventRsvp } from "../app/e/actions";
import { publication, eventSlug, otherEventId } from "./fixtures/publication";
const token = "a".repeat(43);
const input = { submissionId: otherEventId, eventSlug, editToken: token, guestName: "  Guest  ", attending: true, partySize: 3, displayOnGuestList: false, comment: "disabled comment" };
beforeEach(() => {
  vi.resetAllMocks(); mocks.publication.mockResolvedValue(publication);
  mocks.save.mockImplementation(async (rsvp) => ({ status: "created", rsvp })); mocks.update.mockImplementation(async (_hash, rsvp) => rsvp);
});
describe("published event RSVP actions", () => {
  it("blocks new responses and guest edits when the host closes RSVPs", async () => {
    mocks.publication.mockResolvedValue({ ...publication, rsvpsOpen: false });
    for (const action of [submitEventRsvp, updateEventRsvp]) expect(await action(eventSlug, input)).toMatchObject({ ok: false, message: expect.stringContaining("closed RSVPs") });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("saves to the server-resolved event with its rules, trimming names and stripping disabled comments", async () => {
    const result = await submitEventRsvp(eventSlug, input);
    expect(result).toMatchObject({ ok: true, persisted: true, rsvp: { guestName: "Guest", partySize: 3, comment: null } });
    expect(mocks.save.mock.lastCall![2]).toMatchObject({ slug: eventSlug, rsvp: { maxPartySize: 4 } });
    expect(mocks.save.mock.lastCall![1]).not.toBe(token);
  });
  it("stores declined responses with null size and no public name", async () => {
    expect(await submitEventRsvp(eventSlug, { ...input, attending: false, partySize: 10, displayOnGuestList: true })).toMatchObject({ ok: true, rsvp: { partySize: null, displayOnGuestList: false } });
    expect(await updateEventRsvp(eventSlug, { ...input, attending: false, partySize: 10 })).toMatchObject({ ok: true, rsvp: { partySize: null } });
  });
  it.each([{ guestName: " " }, { partySize: 0 }, { partySize: 5 }, { partySize: 1.5 }, { attending: "true" }, { eventSlug: "oyster-roast-2026" }, { editToken: "bad" }])("rejects invalid submission %j", async (override) => {
    expect((await submitEventRsvp(eventSlug, { ...input, ...override })).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires a valid party size when changing back to attending", async () => {
    for (const size of [null, 0, 5]) expect((await updateEventRsvp(eventSlug, { ...input, partySize: size })).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("binds the private edit token lookup to the current event, with no match outside it", async () => {
    mocks.update.mockResolvedValue(null); expect((await updateEventRsvp(eventSlug, input)).ok).toBe(false);
    expect(mocks.update.mock.lastCall![2]).toMatchObject({ slug: eventSlug });
  });
  it("preserves retry identity and acknowledges the DAL's duplicate result", async () => {
    mocks.save.mockResolvedValue({ status: "duplicate", rsvp: { guestName: "Guest" } });
    expect((await submitEventRsvp(eventSlug, input)).ok).toBe(true);
    expect(mocks.save.mock.lastCall![0].id).toBe(input.submissionId);
  });
  it("never reports success when unpublished, disabled, or database/provider failure occurs", async () => {
    mocks.publication.mockResolvedValue(null);
    expect((await submitEventRsvp(eventSlug, input)).ok).toBe(false); expect((await updateEventRsvp(eventSlug, input)).ok).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
    mocks.publication.mockResolvedValue(publication); mocks.save.mockResolvedValue({ status: "disabled" }); expect((await submitEventRsvp(eventSlug, input)).ok).toBe(false);
    mocks.save.mockRejectedValue(new Error("postgresql://secret")); const result = await submitEventRsvp(eventSlug, input);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("secret");
  });
});
