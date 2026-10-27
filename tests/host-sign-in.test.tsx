import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ host: "www.haveashindig.com", principal: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: state.host }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("../lib/server/host-access", () => ({ getHostPrincipal: state.principal }));
import HostSignIn from "../app/host/sign-in/page";

beforeEach(() => {
  state.host = "www.haveashindig.com"; state.principal.mockReset().mockResolvedValue(null);
  for (const [key, value] of Object.entries({ BETTER_AUTH_URL: "https://www.haveashindig.com", BETTER_AUTH_SECRET: "synthetic-test-only-secret-32-characters", DATABASE_URL: "postgresql://synthetic", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", HOST_REGISTRATION_MODE: "invite-only", HOST_SIGNUPS_ENABLED: "true", HOST_ALLOWED_EMAILS: "private-invited@example.test" })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
async function page(error?: string) { return renderToStaticMarkup(await HostSignIn({ searchParams: Promise.resolve({ error }) })); }

describe("registration-aware host sign-in", () => {
  it("preserves invitation-only copy and the separate legacy administrator path", async () => {
    const html = await page();
    expect(html).toContain("available by invitation"); expect(html).toContain("Sign in with Google");
    expect(html).toContain('href="/admin"'); expect(html).not.toContain("private-invited@example.test");
    for (const value of ["postgresql://", "synthetic-secret", "synthetic-test-only", "HOST_ALLOWED_EMAILS"]) expect(html).not.toContain(value);
  });
  it("offers registration only in public mode, without requesting guest accounts", async () => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "public");
    const html = await page();
    expect(html).toContain("Create your host account or sign in with Google");
    expect(html).toContain("Your guests won’t need an account");
    expect(html).toContain("not to access your mail, contacts, or calendar");
    expect(html).not.toContain("available by invitation");
  });
  it.each(["invite-only", "public"])("explains a signup pause but retains returning-host login in %s", async mode => {
    vi.stubEnv("HOST_REGISTRATION_MODE", mode); vi.stubEnv("HOST_SIGNUPS_ENABLED", "false");
    const html = await page("signin");
    expect(html).toContain("New host accounts are temporarily paused");
    expect(html).toContain("Sign in with Google"); expect(html).toContain("same Google account");
    expect(html).not.toContain("Create your host account");
  });
  it("does not display an invitation-only error for public sign-in failures", async () => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "public");
    const html = await page("postgresql://private-details");
    expect(html).toContain("Please try again with a verified Google account");
    expect(html).not.toContain("host pilot"); expect(html).not.toContain("private-details");
  });
  it("shows unavailable without a Google button for invalid policy or unavailable configuration/storage", async () => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "typo");
    expect(await page()).not.toContain("Sign in with Google");
    vi.stubEnv("HOST_REGISTRATION_MODE", "public"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(await page()).not.toContain("Sign in with Google");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-secret"); state.principal.mockRejectedValue(new Error("private DB error"));
    const html = await page();
    expect(html).toContain("isn’t available just yet"); expect(html).not.toContain("Sign in with Google"); expect(html).not.toContain("private DB error");
  });
  it("retains canonical-origin and returning-host redirects", async () => {
    state.host = "www.jaspershucks.app";
    await expect(page()).rejects.toThrow("redirect:https://www.haveashindig.com/host/sign-in");
    state.host = "www.haveashindig.com"; state.principal.mockResolvedValue({ ownerId: "existing-host" });
    vi.stubEnv("HOST_SIGNUPS_ENABLED", "false");
    await expect(page()).rejects.toThrow("redirect:/admin/events");
  });
});
