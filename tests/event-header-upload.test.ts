import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleUpload: vi.fn(),
  isAdminAuthenticated: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
vi.mock("../lib/server/admin-session", () => ({
  isAdminAuthenticated: mocks.isAdminAuthenticated,
}));

import { POST } from "../app/api/admin/event-header/upload/route";

function tokenRequest() {
  return new Request("https://example.test/api/admin/event-header/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }),
    headers: { "content-type": "application/json" },
  });
}

describe("protected Event Hub header uploads", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    mocks.handleUpload.mockReset();
    mocks.isAdminAuthenticated.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not issue an upload token without an admin session", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(false);

    const response = await POST(tokenRequest());

    expect(response.status).toBe(401);
    expect(mocks.handleUpload).not.toHaveBeenCalled();
  });

  it("limits authenticated uploads to Event Hub images under 10 MB", async () => {
    mocks.isAdminAuthenticated.mockResolvedValue(true);
    mocks.handleUpload.mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "client-token",
    });

    const response = await POST(tokenRequest());
    expect(response.status).toBe(200);

    const options = mocks.handleUpload.mock.calls[0][0];
    await expect(
      options.onBeforeGenerateToken(
        "event-hub/oyster-roast-2026/header.webp",
        null,
        true,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/avif",
        ],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
      }),
    );
    await expect(
      options.onBeforeGenerateToken("other/header.webp", null, false),
    ).rejects.toThrow("Invalid upload path");
  });
});
