import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), authHandler: vi.fn(), cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: mocks.cookie }) }));
vi.mock("better-auth", () => ({ betterAuth: () => ({ api: { getSession: mocks.session }, handler: mocks.authHandler, $context: Promise.resolve({}) }) }));
vi.mock("pg", () => ({ Pool: class { on() {} async end() {} } }));
import { allowedHostEmail, canHostSignIn, canRegisterHost, hostAuthConfiguration, hostRegistrationPolicy } from "../lib/server/host-auth-config";
import { getHostAccountSession, hostAuthOptions } from "../lib/server/host-auth";
import { GET, POST } from "../app/api/auth/[...all]/route";

const origin = "https://www.haveashindig.com";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie = "__Secure-shindig-host.session_token=synthetic";
  vi.stubEnv("HOST_REGISTRATION_MODE", undefined); vi.stubEnv("HOST_SIGNUPS_ENABLED", undefined);
  for (const [key, value] of Object.entries({ BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: "a-test-secret-that-is-at-least-32-characters", DATABASE_URL: "postgresql://synthetic-test", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", HOST_ALLOWED_EMAILS: "first@example.test, SECOND@example.test" })) vi.stubEnv(key, value);
  mocks.session.mockResolvedValue(null);
  mocks.authHandler.mockResolvedValue(Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?synthetic=true" }));
});
afterEach(() => vi.unstubAllEnvs());
const post = (path = "sign-in/social", body: unknown = { provider: "google" }, headers: Record<string, string> = {}) => new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body: JSON.stringify(body) });

describe("host identity configuration", () => {
  it("requires complete, server-only configuration and a strong secret", () => {
    expect(hostAuthConfiguration()?.origin).toBe(origin);
    for (const key of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
      const prior = process.env[key]; vi.stubEnv(key, ""); expect(hostAuthConfiguration()).toBeNull(); vi.stubEnv(key, prior);
    }
    vi.stubEnv("BETTER_AUTH_SECRET", "short"); expect(hostAuthConfiguration()).toBeNull();
  });
  it.each(["https://user:secret@example.test", "https://example.test/path", "https://example.test?redirect=evil", "http://example.test", "javascript:alert(1)"])("rejects unsafe auth base URL %s", (url) => {
    vi.stubEnv("BETTER_AUTH_URL", url); expect(hostAuthConfiguration()).toBeNull();
  });
  it("permits loopback HTTP only outside production", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3003"); expect(hostAuthConfiguration()).toBeNull();
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3003"); expect(hostAuthConfiguration()).not.toBeNull();
    vi.stubEnv("NODE_ENV", "production"); expect(hostAuthConfiguration()).toBeNull();
  });
  it("defaults to a closed pilot; matches full email identities, not suffixes", () => {
    expect(hostRegistrationPolicy()).toEqual({ mode: "invite-only", signupsEnabled: true });
    expect(canRegisterHost("first@example.test")).toBe(true);
    expect(canHostSignIn("other@example.test")).toBe(false);
    expect(allowedHostEmail(" First@Example.Test ")).toBe(true);
    expect(allowedHostEmail("first@example.test.evil")).toBe(false);
    expect(allowedHostEmail("other@example.test")).toBe(false);
    vi.stubEnv("HOST_ALLOWED_EMAILS", ""); expect(allowedHostEmail("first@example.test")).toBe(false);
    vi.stubEnv("HOST_ALLOWED_EMAILS", "*"); expect(allowedHostEmail("first@example.test")).toBe(false);
  });
  it("opens new accounts only with the explicit public mode", () => {
    vi.stubEnv("HOST_ALLOWED_EMAILS", "");
    expect(canRegisterHost("new@example.test")).toBe(false);
    vi.stubEnv("HOST_REGISTRATION_MODE", "public");
    expect(canRegisterHost("new@example.test")).toBe(true);
    expect(canHostSignIn("new@example.test")).toBe(true);
    for (const email of ["", "*", "bad-email", "name@example.test\n.evil"]) expect(canRegisterHost(email)).toBe(false);
  });
  it.each(["PUBLIC", "open", "false", "pubic"])("fails closed for invalid mode %s", mode => {
    vi.stubEnv("HOST_REGISTRATION_MODE", mode);
    expect(hostRegistrationPolicy()).toEqual({ mode: null, signupsEnabled: false });
    expect(canHostSignIn("first@example.test")).toBe(false);
    expect(canRegisterHost("first@example.test")).toBe(false);
  });
  it.each(["invite-only", "public"])("pauses every new account but not eligible existing sessions in %s", async mode => {
    vi.stubEnv("HOST_REGISTRATION_MODE", mode); vi.stubEnv("HOST_SIGNUPS_ENABLED", "false");
    const email = mode === "public" ? "not-allowlisted@example.test" : "first@example.test";
    expect(canRegisterHost(email)).toBe(false); expect(canHostSignIn(email)).toBe(true);
    const user = { id: "existing-host", name: "Existing", email, emailVerified: true };
    const options = hostAuthOptions({} as Pool, hostAuthConfiguration()!);
    expect(await options.databaseHooks!.user!.create!.before!(user as never, null)).toBe(false);
    const lookup = vi.fn().mockResolvedValue(user);
    expect(await options.databaseHooks!.session!.create!.before!({ userId: user.id } as never, { context: { internalAdapter: { findUserById: lookup } } } as never)).not.toBe(false);
    mocks.session.mockResolvedValue({ user }); expect(await getHostAccountSession()).toMatchObject({ id: user.id });
    mocks.session.mockResolvedValue({ user: { ...user, emailVerified: false } }); expect(await getHostAccountSession()).toBeNull();
  });
  it.each(["", "TRUE", "yes", "0", "false"])("fails closed for signup flag %j without revoking existing access", flag => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "public"); vi.stubEnv("HOST_SIGNUPS_ENABLED", flag);
    expect(canRegisterHost("new@example.test")).toBe(false);
    expect(canHostSignIn("existing@example.test")).toBe(true);
  });
  it("checks new-account admission at callback time, not only auth initialization", async () => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "public");
    const options = hostAuthOptions({} as Pool, hostAuthConfiguration()!);
    const user = { email: "new@example.test", emailVerified: true, image: "https://private.example.test/profile" };
    const create = options.databaseHooks!.user!.create!.before!;
    expect(await create(user as never, null)).toMatchObject({ data: { image: null } });
    expect(await create({ ...user, emailVerified: false } as never, null)).toBe(false);
    vi.stubEnv("HOST_SIGNUPS_ENABLED", "false"); expect(await create(user as never, null)).toBe(false);
    vi.stubEnv("HOST_SIGNUPS_ENABLED", "true"); expect(await create(user as never, null)).not.toBe(false);
    vi.stubEnv("HOST_REGISTRATION_MODE", "invite-only"); expect(await create(user as never, null)).toBe(false);
  });
  it("rechecks access on existing sessions when changing public back to invite-only", async () => {
    const user = { id: "public-host", name: "Public", email: "public@example.test", emailVerified: true };
    mocks.session.mockResolvedValue({ user });
    vi.stubEnv("HOST_REGISTRATION_MODE", "public"); expect(await getHostAccountSession()).not.toBeNull();
    vi.stubEnv("HOST_REGISTRATION_MODE", "invite-only"); expect(await getHostAccountSession()).toBeNull();
    vi.stubEnv("HOST_ALLOWED_EMAILS", user.email); expect(await getHostAccountSession()).not.toBeNull();
  });
  it("uses verified, currently allowed, database-backed sessions only", async () => {
    const user = { id: "host-one", name: "One", email: "first@example.test", emailVerified: true };
    mocks.session.mockResolvedValue({ user }); expect(await getHostAccountSession()).toEqual({ id: user.id, name: user.name, email: user.email });
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({ query: { disableCookieCache: true } }));
    mocks.session.mockResolvedValue({ user: { ...user, emailVerified: false } }); expect(await getHostAccountSession()).toBeNull();
    mocks.session.mockResolvedValue({ user }); vi.stubEnv("HOST_ALLOWED_EMAILS", "second@example.test"); expect(await getHostAccountSession()).toBeNull();
    mocks.session.mockRejectedValue(new Error("storage failed")); await expect(getHostAccountSession()).rejects.toThrow();
  });
  it("does not initialize host authentication for anonymous visitors or unrelated cookies", async () => {
    for (const cookie of ["", "other=value", "not-shindig-host.session_token=forged"]) {
      mocks.cookie = cookie; expect(await getHostAccountSession()).toBeNull();
    }
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not weaken OAuth checks or persist provider tokens", async () => {
    const options = hostAuthOptions({} as Pool, hostAuthConfiguration()!);
    expect(options.account).toMatchObject({ accountLinking: { enabled: false }, encryptOAuthTokens: true, storeAccountCookie: false });
    expect(options.advanced).toMatchObject({ defaultCookieAttributes: { httpOnly: true, sameSite: "lax" }, crossSubDomainCookies: { enabled: false } });
    expect(options.advanced?.disableCSRFCheck).not.toBe(true); expect(options.advanced?.disableOriginCheck).not.toBe(true);
    expect(options.rateLimit).toMatchObject({ enabled: true, storage: "database" });
    expect(options.emailAndPassword?.enabled).toBe(false);
    const before = options.databaseHooks!.account!.create!.before!;
    const result = await before({ accessToken: "secret", refreshToken: "secret", idToken: "secret" } as never, null);
    expect(result).toMatchObject({ data: { accessToken: null, refreshToken: null, idToken: null } });
    const create = options.databaseHooks!.user!.create!.before!;
    expect(await create({ email: "first@example.test", emailVerified: false } as never, null)).toBe(false);
    expect(await create({ email: "stranger@example.test", emailVerified: true } as never, null)).toBe(false);
  });
});

describe("narrow public auth route", () => {
  it("uses Next.js's canonical localhost origin for local development", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3003");
    const response = await POST(new NextRequest("http://localhost:3003/api/auth/sign-in/social", { method: "POST", headers: { origin: "http://localhost:3003", "content-type": "application/json" }, body: JSON.stringify({ provider: "google" }) }));
    expect(response.status).toBe(200);
    expect(await (mocks.authHandler.mock.calls[0][0] as Request).json()).toMatchObject({ callbackURL: "http://localhost:3003/admin/events" });
  });
  it("only starts Google OAuth with fixed trusted return destinations", async () => {
    const response = await POST(post()); expect(response.status).toBe(200);
    const forwarded = mocks.authHandler.mock.calls[0][0] as Request;
    expect(await forwarded.json()).toEqual({ provider: "google", callbackURL: `${origin}/admin/events`, newUserCallbackURL: `${origin}/admin/events`, errorCallbackURL: `${origin}/host/sign-in?error=signin` });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain("shindig_admin_session=;");
  });
  it.each([{ provider: "google", callbackURL: "https://evil.test" }, { provider: "google", scopes: ["gmail"] }, { provider: "google", idToken: { token: "forged" } }, { provider: "google", requestSignUp: true }, { provider: "google", registrationMode: "public" }, { provider: "google", signupsEnabled: true }, { provider: "github" }, null, []])("rejects caller-controlled auth parameters %j", async (body) => {
    expect((await POST(post("sign-in/social", body))).status).toBe(400); expect(mocks.authHandler).not.toHaveBeenCalled();
  });
  it("keeps OAuth available to returning hosts during a signup pause", async () => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "public"); vi.stubEnv("HOST_SIGNUPS_ENABLED", "false");
    expect((await POST(post())).status).toBe(200);
    const request = new Request(`${origin}/api/auth/callback/google?code=test&state=test`);
    await GET(request); expect(mocks.authHandler).toHaveBeenCalledWith(request);
    // The database creation hook rejects new users; login cannot tell accounts
    // apart until Google has verified identity. No public email lookup is added.
  });
  it("blocks invalid registration configuration but still permits logout", async () => {
    vi.stubEnv("HOST_REGISTRATION_MODE", "typo");
    expect((await POST(post())).status).toBe(503);
    expect((await GET(new Request(`${origin}/api/auth/callback/google?code=test&state=test`))).status).toBe(503);
    expect(mocks.authHandler).not.toHaveBeenCalled();
    expect((await POST(post("sign-out", {}))).status).toBe(200);
  });
  it("blocks cross-site requests even before the auth library", async () => {
    expect((await POST(post("sign-in/social", undefined, { Origin: "https://evil.test" }))).status).toBe(403);
    expect((await POST(post("sign-in/social", undefined, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(mocks.authHandler).not.toHaveBeenCalled();
  });
  it.each(["get-session", "sign-up/email", "sign-in/email", "link-social", "update-user", "get-access-token", "delete-user"])("never exposes the unused %s API", async (path) => {
    expect((await GET(new Request(`${origin}/api/auth/${path}`))).status).toBe(404);
    expect((await POST(post(path))).status).toBe(404); expect(mocks.authHandler).not.toHaveBeenCalled();
  });
  it("passes OAuth callbacks to the library for state/PKCE/nonce verification", async () => {
    const request = new Request(`${origin}/api/auth/callback/google?code=test&state=test`);
    await GET(request); expect(mocks.authHandler).toHaveBeenCalledWith(request);
  });
  it("preserves provider errors/rate limits, and hides unexpected failure details", async () => {
    mocks.authHandler.mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "60" } }));
    const limited = await POST(post()); expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    mocks.authHandler.mockRejectedValue(new Error("postgresql://secret"));
    const failed = await POST(post()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("secret");
  });
  it("bounds request bodies and fails closed when unconfigured", async () => {
    expect((await POST(post("sign-in/social", { provider: "x".repeat(5000) }))).status).toBe(413);
    vi.stubEnv("BETTER_AUTH_SECRET", ""); expect((await POST(post())).status).toBe(503);
  });
  it("permits logout, but not caller-selected redirects", async () => {
    expect((await POST(post("sign-out", {}))).status).toBe(200);
    expect((await POST(post("sign-out", { callbackURL: "https://evil.test" }))).status).toBe(400);
  });
});
