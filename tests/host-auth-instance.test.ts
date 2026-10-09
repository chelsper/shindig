import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: undefined as Promise<unknown> | undefined, close: vi.fn() }));
vi.mock("better-auth", () => ({ betterAuth: () => ({ $context: mocks.context }) }));
vi.mock("pg", () => ({ Pool: class { on() {} async end() { mocks.close(); } } }));
import { getHostAuth } from "../lib/server/host-auth";
afterEach(() => vi.unstubAllEnvs());
describe("host auth cold-start recovery", () => {
  it("discards an initialization failure, closes its pool, and allows a new attempt", async () => {
    for (const [key, value] of Object.entries({ BETTER_AUTH_URL: "https://shindig.example.test", BETTER_AUTH_SECRET: "synthetic-test-only-secret-32-characters-long", DATABASE_URL: "postgresql://synthetic", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic" })) vi.stubEnv(key, value);
    mocks.context = Promise.reject(new Error("synthetic connection failure"));
    const failed = getHostAuth()!;
    await expect(failed.$context).rejects.toThrow("synthetic connection failure");
    expect(mocks.close).toHaveBeenCalledOnce();
    mocks.context = Promise.resolve({});
    const recovered = getHostAuth()!;
    expect(recovered).not.toBe(failed); expect(getHostAuth()).toBe(recovered);
    await expect(recovered.$context).resolves.toEqual({});
  });
});
