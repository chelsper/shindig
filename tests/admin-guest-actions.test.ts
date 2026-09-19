import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRsvpForAdmin: vi.fn(),
  deleteRsvpForAdmin: vi.fn(),
  isAdminAuthenticated: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  updateRsvpForAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../lib/server/admin-session", () => ({
  isAdminAuthenticated: mocks.isAdminAuthenticated,
}));
vi.mock("../lib/server/rsvps", () => ({
  createRsvpForAdmin: mocks.createRsvpForAdmin,
  deleteRsvpForAdmin: mocks.deleteRsvpForAdmin,
  updateRsvpForAdmin: mocks.updateRsvpForAdmin,
}));

import {
  createAdminGuest,
  deleteAdminGuest,
  updateAdminGuest,
} from "../app/admin/actions";

const rsvpId = "4f849d18-931b-42ef-a4d4-7ec07aa73b3d";

function attendingForm() {
  const formData = new FormData();
  formData.set("guestName", "  Host Added Guest  ");
  formData.set("attending", "true");
  formData.set("partySize", "3");
  formData.set("displayOnGuestList", "on");
  formData.set("comment", "  Welcome!  ");
  return formData;
}

describe("admin guest mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("refuses to mutate data without an authenticated admin session", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(false);

    await expect(
      createAdminGuest({ error: null }, attendingForm()),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createRsvpForAdmin).not.toHaveBeenCalled();
  });

  it("creates a validated RSVP and refreshes private and public views", async () => {
    mocks.createRsvpForAdmin.mockResolvedValue(undefined);

    await expect(
      createAdminGuest({ error: null }, attendingForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createRsvpForAdmin).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      {
        guestName: "Host Added Guest",
        attending: true,
        partySize: 3,
        displayOnGuestList: true,
        comment: "Welcome!",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
  });

  it("forces party size and public visibility off for a declined edit", async () => {
    mocks.updateRsvpForAdmin.mockResolvedValue(true);
    const formData = attendingForm();
    formData.set("attending", "false");
    formData.set("partySize", "12");

    await expect(
      updateAdminGuest(rsvpId, { error: null }, formData),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updateRsvpForAdmin).toHaveBeenCalledWith(rsvpId, {
      guestName: "Host Added Guest",
      attending: false,
      partySize: null,
      displayOnGuestList: false,
      comment: "Welcome!",
    });
  });

  it("rejects invalid admin input before reaching the database", async () => {
    const formData = attendingForm();
    formData.set("guestName", "   ");

    await expect(
      createAdminGuest({ error: null }, formData),
    ).resolves.toEqual({ error: "Please enter your name." });
    expect(mocks.createRsvpForAdmin).not.toHaveBeenCalled();
  });

  it("deletes only a valid RSVP id after authentication", async () => {
    mocks.deleteRsvpForAdmin.mockResolvedValue(true);

    await expect(
      deleteAdminGuest(rsvpId, { error: null }, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.deleteRsvpForAdmin).toHaveBeenCalledWith(rsvpId);
  });
});
