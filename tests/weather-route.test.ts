import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({ live: vi.fn(), typical: vi.fn() }));
vi.mock("../lib/server/weather", () => ({ eventWeatherService: service }));
vi.mock("../lib/server/invitation-settings", () => ({ getEventConfiguration: vi.fn() }));
import { getEventConfiguration } from "../lib/server/invitation-settings";
import { GET } from "../app/api/weather/route";
import { OYSTER_ROAST_EVENT as event } from "../lib/oyster-roast-event";
import { typical, weather } from "./fixtures/weather";

beforeEach(() => { vi.resetAllMocks(); vi.mocked(getEventConfiguration).mockResolvedValue(event); service.live.mockResolvedValue(weather); service.typical.mockResolvedValue(typical); });
afterEach(() => { event.features.weather = true; });

describe("public weather route", () => {
  it("uses host-updated date and coordinates instead of the original defaults", async () => {
    const updated = { ...event, startsAtUtc: "2026-12-12T22:00:00.000Z", coordinates: { latitude: 30.1, longitude: -81.7 } };
    vi.mocked(getEventConfiguration).mockResolvedValue(updated);
    await GET(new Request("https://shindig.test/api/weather"));
    expect(service.live).toHaveBeenCalledWith(updated);
  });
  it("uses only the configured event and returns no credentials or raw provider location", async () => {
    const response = await GET(new Request("https://shindig.test/api/weather?latitude=0&longitude=0&event=other&url=https://example.com"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(service.live).toHaveBeenCalledWith(event);
    expect(service.typical).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data).toEqual({ weather });
    for (const key of ["latitude", "longitude", "apikey", "DATABASE_URL", "guest_name"]) expect(JSON.stringify(data)).not.toContain(key);
  });
  it("loads historical context separately without holding up live weather", async () => {
    const response = await GET(new Request("https://shindig.test/api/weather?context=typical"));
    expect(await response.json()).toEqual({ typical });
    expect(service.typical).toHaveBeenCalledWith(event);
    expect(service.live).not.toHaveBeenCalled();
  });
  it("does no provider work when the event weather feature is disabled", async () => {
    event.features.weather = false;
    expect((await GET(new Request("https://shindig.test/api/weather"))).status).toBe(404);
    expect(service.live).not.toHaveBeenCalled();
    expect(service.typical).not.toHaveBeenCalled();
  });
  it("contains unexpected errors instead of leaking provider or server details", async () => {
    service.live.mockRejectedValue(new Error("private connection data"));
    const response = await GET(new Request("https://shindig.test/api/weather"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private connection data");
  });
});
