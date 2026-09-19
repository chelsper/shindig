import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));

import {
  DEFAULT_EVENT_HUB_HEADER,
  validateEventHubHeaderSettings,
} from "../lib/event-hub-settings";
import {
  getEventHubHeaderSettings,
  saveEventHubHeaderSettings,
} from "../lib/server/event-hub-settings";

const uploadedSettings = {
  imageUrl:
    "https://abc.public.blob.vercel-storage.com/event-hub/oyster-roast-2026/header-123.webp",
  imageAlt: "Oysters arranged on a coastal table",
  focalX: 62,
  focalY: 38,
  zoomPercent: 125,
};

describe("Event Hub header validation", () => {
  it("accepts the original artwork and approved Vercel Blob images", () => {
    expect(validateEventHubHeaderSettings(DEFAULT_EVENT_HUB_HEADER)).toEqual({
      success: true,
      data: DEFAULT_EVENT_HUB_HEADER,
    });
    expect(validateEventHubHeaderSettings(uploadedSettings)).toEqual({
      success: true,
      data: uploadedSettings,
    });
  });

  it("rejects arbitrary remote images and out-of-range crop settings", () => {
    expect(
      validateEventHubHeaderSettings({
        ...uploadedSettings,
        imageUrl: "https://example.com/untrusted.jpg",
      }),
    ).toEqual({ success: false, message: "Please upload a valid header image." });

    expect(
      validateEventHubHeaderSettings({ ...uploadedSettings, zoomPercent: 250 }),
    ).toEqual({
      success: false,
      message: "Please check the image position and zoom.",
    });
  });
});

describe("Event Hub header persistence", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
    mocks.neon.mockReset();
    mocks.sql.mockReset();
    mocks.neon.mockReturnValue(mocks.sql);
  });

  it("uses canonical artwork when no override has been saved", async () => {
    mocks.sql.mockResolvedValueOnce([]);

    await expect(getEventHubHeaderSettings()).resolves.toEqual(
      DEFAULT_EVENT_HUB_HEADER,
    );
  });

  it("upserts only validated header presentation fields for the known event", async () => {
    mocks.sql.mockResolvedValueOnce([]);

    await expect(
      saveEventHubHeaderSettings(uploadedSettings),
    ).resolves.toBeUndefined();

    const [queryParts, ...values] = mocks.sql.mock.calls[0];
    expect(queryParts.join("?")).toContain("ON CONFLICT (event_slug) DO UPDATE");
    expect(values).toEqual([
      "oyster-roast-2026",
      uploadedSettings.imageUrl,
      uploadedSettings.imageAlt,
      62,
      38,
      125,
    ]);
  });
});
