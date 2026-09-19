import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ neon: vi.fn(), sql: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { blockMusicProvider, consumeMusicQuota, throttleMusicRequest } from "../lib/server/music/rate-limit";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/neondb");
  vi.stubEnv("VERCEL", "1");
  mocks.neon.mockReturnValue(mocks.sql);
  mocks.sql.mockResolvedValue([{ count: 1, retry: 60, cooldown: 0 }]);
});

describe("shared database-backed music throttling", () => {
  it("uses an atomic, expiring window and does not clean up the row being incremented", async () => {
    await consumeMusicQuota("key", 5);
    const [parts, ...values] = mocks.sql.mock.calls[0];
    expect(parts.join("?")).toContain("ON CONFLICT (bucket_key) DO UPDATE");
    expect(parts.join("?")).toContain("AND bucket_key <> ? AND bucket_key <> ?");
    expect(values).toEqual(["key", "", "key", ""]);
  });

  it.each([{ count: 61, retry: 30, cooldown: 0 }, { count: 1, retry: 60, cooldown: 30 }])("enforces request counts and shared provider cooldowns", async (row) => {
    mocks.sql.mockResolvedValue([row]);
    await expect(consumeMusicQuota("key", 60, "cooldown:spotify")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 30 });
  });

  it("hashes Vercel's trusted client IP and ignores spoofable forwarded headers", async () => {
    await throttleMusicRequest("search", new Headers({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "evil" }));
    const first = mocks.sql.mock.calls[0].slice(1);
    expect(JSON.stringify(first)).not.toMatch(/192\.0\.2\.1|evil/);
    expect(first[0]).toMatch(/^search:[a-f0-9]{64}$/);
    await throttleMusicRequest("search", new Headers({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "different" }));
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual(first);
  });

  it("persists Retry-After without shortening an existing provider cooldown", async () => {
    await blockMusicProvider("spotify", 45);
    const [parts, ...values] = mocks.sql.mock.calls[0];
    expect(parts.join("?")).toContain("greatest(music_request_limits.expires_at, excluded.expires_at)");
    expect(values).toEqual(["cooldown:spotify", 45]);
  });
});
