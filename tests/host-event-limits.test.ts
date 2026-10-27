import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ principal: vi.fn(), sql: vi.fn(), neon: vi.fn() }));
vi.mock("../lib/server/host-access", () => ({ requireHostPrincipal: mocks.principal }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { getHostEventLimit, getHostEventUsage, rethrowHostEventLimit } from "../lib/server/host-event-limits";
import { HostEventLimitError } from "../lib/host-event-limits";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("HOST_EVENT_LIMIT", undefined); vi.stubEnv("DATABASE_URL", "postgresql://test");
  mocks.principal.mockResolvedValue({ ownerId: "host-one" }); mocks.neon.mockReturnValue(mocks.sql);
});
afterEach(() => vi.unstubAllEnvs());
describe("server-owned event limit policy", () => {
  it("defaults to ten and supports an operator-configured positive integer", () => {
    expect(getHostEventLimit()).toBe(10);
    for (const raw of ["1", "25", "1000", " 8 "]) { vi.stubEnv("HOST_EVENT_LIMIT", raw); expect(getHostEventLimit()).toBe(Number(raw)); }
  });
  it.each(["", " ", "0", "-1", "1.5", "Infinity", "NaN", "1e2", "01", "1001", "unlimited"])("fails closed on invalid configuration %j", value => {
    vi.stubEnv("HOST_EVENT_LIMIT", value); expect(getHostEventLimit).toThrow("not configured correctly");
  });
  it("reads only authenticated-owner usage, with no lifecycle filter or guest records", async () => {
    mocks.sql.mockResolvedValue([{ used: 13 }]);
    expect(await getHostEventUsage()).toEqual({ used: 13, limit: 10 });
    const [sql, ...values] = mocks.sql.mock.calls[0];
    expect(sql.join("?")).toContain("owner_host_id IS NOT DISTINCT FROM ?::text");
    expect(sql.join("?")).not.toMatch(/status|visibility|rsvps|SELECT \*/);
    expect(values).toEqual(["host-one"]);
    mocks.principal.mockResolvedValue({ ownerId: null });
    await getHostEventUsage(); expect(mocks.sql.mock.calls[1].slice(1)).toEqual([null]);
  });
  it("authenticates before configuration or database access", async () => {
    mocks.principal.mockRejectedValue(new Error("Host access required"));
    vi.stubEnv("HOST_EVENT_LIMIT", "bad");
    await expect(getHostEventUsage()).rejects.toThrow("Host access"); expect(mocks.neon).not.toHaveBeenCalled();
  });
  it.each([[], [{ used: -1 }], [{ used: "0" }], [{ used: null }]].map(rows => ({ rows })))("never converts unavailable usage into zero: $rows", async ({ rows }) => {
    mocks.sql.mockResolvedValue(rows); await expect(getHostEventUsage()).rejects.toThrow("unavailable");
  });
  it("propagates provider failure and refuses reads without a database", async () => {
    mocks.sql.mockRejectedValue(new Error("offline")); await expect(getHostEventUsage()).rejects.toThrow("offline");
    vi.stubEnv("DATABASE_URL", ""); await expect(getHostEventUsage()).rejects.toThrow("unavailable");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("translates only the exact quota signal, never arbitrary database messages", () => {
    expect(() => rethrowHostEventLimit({ code: "P0001", constraint: "shindig_host_event_limit", message: "secret" }, 10)).toThrow(HostEventLimitError);
    for (const error of [{ code: "P0001", constraint: "other" }, { code: "23505", constraint: "shindig_host_event_limit" }, new Error("secret")]) {
      try { rethrowHostEventLimit(error, 10); } catch (caught) { expect(caught).toBe(error); }
    }
  });
});
