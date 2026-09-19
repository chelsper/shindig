import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(),
  listRsvps: vi.fn(),
  rsvpsToCsv: vi.fn(),
}));

vi.mock("../lib/server/admin-session", () => ({
  isAdminAuthenticated: mocks.isAdminAuthenticated,
}));
vi.mock("../lib/server/rsvps", () => ({
  listRsvps: mocks.listRsvps,
}));
vi.mock("../lib/server/rsvp-csv", () => ({
  rsvpsToCsv: mocks.rsvpsToCsv,
}));

import { GET } from "../app/admin/export/route";

describe("protected admin CSV export", () => {
  beforeEach(() => {
    mocks.isAdminAuthenticated.mockReset();
    mocks.listRsvps.mockReset();
    mocks.rsvpsToCsv.mockReset();
  });

  it("does not query or reveal RSVPs without an admin session", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(mocks.listRsvps).not.toHaveBeenCalled();
  });

  it("exports all RSVPs for an authenticated admin", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.listRsvps.mockResolvedValue([{ id: "one" }]);
    mocks.rsvpsToCsv.mockReturnValue("guest_name,attending\r\nSam,true");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.listRsvps).toHaveBeenCalledWith("all");
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(
      "oyster-roast-2026-rsvps.csv",
    );
    expect(await response.text()).toContain("Sam,true");
  });
});
