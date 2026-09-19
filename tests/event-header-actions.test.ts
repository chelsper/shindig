import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(),
  revalidatePath: vi.fn(),
  saveEventHubHeaderSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../lib/server/admin-session", () => ({
  isAdminAuthenticated: mocks.isAdminAuthenticated,
}));
vi.mock("../lib/server/event-hub-settings", () => ({
  saveEventHubHeaderSettings: mocks.saveEventHubHeaderSettings,
}));

import { saveEventHeaderSettings } from "../app/admin/event/actions";

function validForm() {
  const formData = new FormData();
  formData.set(
    "imageUrl",
    "https://abc.public.blob.vercel-storage.com/event-hub/oyster-roast-2026/header.webp",
  );
  formData.set("imageAlt", "Oysters on a coastal table");
  formData.set("focalX", "55");
  formData.set("focalY", "30");
  formData.set("zoomPercent", "115");
  return formData;
}

describe("saveEventHeaderSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.saveEventHubHeaderSettings.mockResolvedValue(undefined);
  });

  it("does not save without an authenticated host session", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(false);

    await expect(
      saveEventHeaderSettings({ error: null, success: false }, validForm()),
    ).resolves.toEqual({
      error: "Your host session has expired. Sign in again before saving.",
      success: false,
    });
    expect(mocks.saveEventHubHeaderSettings).not.toHaveBeenCalled();
  });

  it("saves validated settings and refreshes the Event Hub", async () => {
    await expect(
      saveEventHeaderSettings({ error: null, success: false }, validForm()),
    ).resolves.toEqual({ error: null, success: true });

    expect(mocks.saveEventHubHeaderSettings).toHaveBeenCalledWith({
      imageUrl:
        "https://abc.public.blob.vercel-storage.com/event-hub/oyster-roast-2026/header.webp",
      imageAlt: "Oysters on a coastal table",
      focalX: 55,
      focalY: 30,
      zoomPercent: 115,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/event");
  });
});
