import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAdminSessionToken,
  isAdminConfigured,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "../lib/server/admin-session";

describe("admin session security", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies the configured password exactly", () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-strong-host-password");

    expect(isAdminConfigured()).toBe(true);
    expect(verifyAdminPassword("a-strong-host-password")).toBe(true);
    expect(verifyAdminPassword("A-strong-host-password")).toBe(false);
  });

  it("fails closed when no password is configured", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");

    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("")).toBe(false);
    expect(createAdminSessionToken()).toBeNull();
  });

  it("accepts a signed, unexpired token", () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-strong-host-password");
    const now = Date.UTC(2026, 8, 19, 12);
    const token = createAdminSessionToken(now);

    expect(token).not.toBeNull();
    expect(verifyAdminSessionToken(token!, now + 1_000)).toBe(true);
  });

  it("rejects tampered and expired tokens", () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-strong-host-password");
    const now = Date.UTC(2026, 8, 19, 12);
    const token = createAdminSessionToken(now)!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(verifyAdminSessionToken(tampered, now + 1_000)).toBe(false);
    expect(verifyAdminSessionToken(token, now + 12 * 60 * 60 * 1_000)).toBe(false);
  });

  it("invalidates sessions after a password change", () => {
    vi.stubEnv("ADMIN_PASSWORD", "first-password");
    const token = createAdminSessionToken()!;
    vi.stubEnv("ADMIN_PASSWORD", "replacement-password");

    expect(verifyAdminSessionToken(token)).toBe(false);
  });
});
