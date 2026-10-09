// Real Better Auth + PostgreSQL adapter, isolated in memory; never Google/Neon.
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Pool } from "pg";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { hostAuthOptions } from "../lib/server/host-auth";

const embeddedModule = process.env.SHINDIG_TEST_PGLITE;
const config = { origin: "https://shindig.example.test", secret: "synthetic-host-secret-only-for-isolated-tests-1234", databaseUrl: "unused", clientId: "synthetic-google-client", clientSecret: "synthetic-google-secret" };
let db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; affectedRows?: number }>; exec: (text: string) => Promise<unknown>; close: () => Promise<void> };
let auth: ReturnType<typeof betterAuth>;
let cookieName: string;
let pool: Pool;
function cookie(token: string, secret = config.secret) {
  return `${cookieName}=${encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`)}`;
}
function request(path: string, body: unknown = {}, extra: Record<string, string> = {}) {
  return new Request(`${config.origin}/api/auth${path}`, { method: "POST", headers: { origin: config.origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1", ...extra }, body: JSON.stringify(body) });
}
describe.skipIf(!embeddedModule)("real host authentication storage and sessions", () => {
  beforeAll(async () => {
    if (!/^\/private\/tmp\/[a-zA-Z0-9._/@-]+\/dist\/index.js$/.test(embeddedModule!)) throw new Error("Only use a disposable local PGlite installation.");
    const { PGlite } = await import(/* @vite-ignore */ embeddedModule!);
    db = new PGlite();
    for (const file of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
    // Exercise the actual Kysely Postgres adapter with a minimal pg transport.
    pool = { connect: async () => ({ query: async (text: string, values: unknown[]) => {
      const result = await db.query(text, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, command: text.trim().split(/\s/)[0].toUpperCase() };
    }, release() {} }), end: async () => {} } as unknown as Pool;
    vi.stubEnv("HOST_ALLOWED_EMAILS", "alice@example.test"); vi.stubEnv("VERCEL", "1");
    auth = betterAuth(hostAuthOptions(pool, config));
    cookieName = (await auth.$context).authCookies.sessionToken.name;
    await db.query(`INSERT INTO host_users (id, name, email, "emailVerified") VALUES ('alice', 'Alice', 'alice@example.test', true)`);
  }, 30000);
  afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

  it("matches the library's required schema without runtime migrations", async () => {
    const plan = await getMigrations(hostAuthOptions(pool, config));
    expect(plan.toBeCreated).toEqual([]); expect(plan.toBeAdded).toEqual([]);
    expect(plan.schemaProblems).toEqual([]); expect(plan.unsafeChanges).toEqual([]);
  });
  it("uses secure, HttpOnly, same-site, host-only cookies and live database sessions", async () => {
    const context = await auth.$context;
    expect(context.authCookies.sessionToken.attributes).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/" });
    expect(context.authCookies.sessionToken.attributes.domain).toBeUndefined();
    expect(cookieName).toBe("__Secure-shindig-host.session_token");
    await db.query(`INSERT INTO host_sessions (id, "userId", token, "expiresAt") VALUES ('active', 'alice', 'synthetic-active-token', now() + interval '2 hours'), ('expired', 'alice', 'synthetic-expired-token', now() - interval '1 minute')`);
    const get = (value: string) => auth.api.getSession({ headers: new Headers({ cookie: value }), query: { disableCookieCache: true } });
    expect((await get(cookie("synthetic-active-token")))?.user.id).toBe("alice");
    expect(await get(cookie("synthetic-active-token", "forged-signature"))).toBeNull();
    expect(await get(cookie("synthetic-expired-token"))).toBeNull();
    expect(await get(cookie("unknown-token"))).toBeNull();
    const out = await auth.handler(request("/sign-out", {}, { cookie: cookie("synthetic-active-token") }));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await get(cookie("synthetic-active-token"))).toBeNull();
    expect((await db.query(`SELECT id FROM host_sessions WHERE id = 'active'`)).rows).toEqual([]);
  });
  it("refuses cross-origin sign-in and logout at the library layer too", async () => {
    for (const path of ["/sign-in/social", "/sign-out"]) {
      expect((await auth.handler(request(path, { provider: "google" }, { origin: "https://attacker.example.test", cookie: cookie("synthetic-active-token") }))).status).toBe(403);
    }
  });
  it("creates expiring OAuth state + PKCE without any provider request", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No external network allowed in this test"));
    try {
      const res = await auth.handler(request("/sign-in/social", { provider: "google", callbackURL: `${config.origin}/admin/events` }));
      expect(res.status).toBe(200);
      const url = new URL((await res.json()).url);
      expect(url.hostname).toBe("accounts.google.com"); expect(url.searchParams.get("redirect_uri")).toBe(`${config.origin}/api/auth/callback/google`);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")?.length).toBeGreaterThan(40);
      expect(url.searchParams.get("state")?.length).toBeGreaterThan(20);
      expect(url.searchParams.get("access_type")).toBe("online");
      expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
      expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
      const failed = await auth.handler(new Request(`${config.origin}/api/auth/callback/google?code=fake&state=invalid`));
      expect(failed.status).toBe(302); expect(failed.headers.get("location")).toContain("error=");
      expect(network).not.toHaveBeenCalled();
      expect((await db.query("SELECT id FROM host_users")).rows).toEqual([{ id: "alice" }]);
    } finally { network.mockRestore(); }
  });
  it("persists request throttling across auth instances", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await auth.handler(request("/sign-in/social", { provider: "google" }, { "x-vercel-forwarded-for": "192.0.2.50" }))).status).toBe(200);
    }
    const anotherInstance = betterAuth(hostAuthOptions(pool, config));
    const limited = await anotherInstance.handler(request("/sign-in/social", { provider: "google" }, { "x-vercel-forwarded-for": "192.0.2.50" }));
    expect(limited.status).toBe(429); expect(Number(limited.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect((await db.query("SELECT count(*)::integer AS count FROM host_auth_rate_limits")).rows[0].count).toBeGreaterThan(0);
  });
  it("completes a simulated Google callback, discards provider tokens, and rejects uninvited/unverified accounts", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "synthetic-key", alg: "RS256", use: "sig" };
    let idToken = "";
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "discard-this-access-token", refresh_token: "discard-this-refresh-token", token_type: "Bearer", expires_in: 3600, id_token: idToken });
      if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
      throw new Error("Unexpected external request in isolated auth test");
    });
    async function login(email: string, verified: boolean) {
      const start = await auth.handler(request("/sign-in/social", { provider: "google", callbackURL: `${config.origin}/admin/events` }, { "x-vercel-forwarded-for": "192.0.2.90" }));
      expect(start.status).toBe(200);
      const url = new URL((await start.json()).url);
      const oauthCookie = start.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: config.clientId, sub: `google-${email}`, email, email_verified: verified, name: "Synthetic host", iat: now, exp: now + 3600, nonce: url.searchParams.get("nonce") })).toString("base64url");
      idToken = `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")}`;
      return auth.handler(new Request(`${config.origin}/api/auth/callback/google?code=synthetic&state=${url.searchParams.get("state")}`, { headers: { cookie: oauthCookie, "x-vercel-forwarded-for": "192.0.2.90" } }));
    }
    try {
      vi.stubEnv("HOST_ALLOWED_EMAILS", "alice@example.test, invited@example.test, unverified@example.test");
      const success = await login("invited@example.test", true);
      expect(success.status).toBe(302); expect(success.headers.get("location")).toBe(`${config.origin}/admin/events`);
      const sessionCookie = success.headers.getSetCookie().find((value) => value.startsWith(`${cookieName}=`))!.split(";")[0];
      expect(sessionCookie).toBeTruthy();
      const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });
      expect(session?.user).toMatchObject({ email: "invited@example.test", emailVerified: true });
      expect((await db.query(`SELECT "providerId", "accessToken", "refreshToken", "idToken" FROM host_accounts WHERE "userId" = $1`, [session!.user.id])).rows).toEqual([{ providerId: "google", accessToken: null, refreshToken: null, idToken: null }]);
      for (const [email, verified] of [["outsider@example.test", true], ["unverified@example.test", false]] as const) {
        const denied = await login(email, verified);
        expect(denied.headers.get("location")).toContain("error=");
        expect((await db.query(`SELECT id FROM host_users WHERE email = $1`, [email])).rows).toEqual([]);
        expect(denied.headers.getSetCookie().some((value) => value.startsWith(`${cookieName}=`) && !value.includes("Max-Age=0"))).toBe(false);
      }
      // Existing accounts cannot create new sessions once removed from the pilot.
      vi.stubEnv("HOST_ALLOWED_EMAILS", "alice@example.test");
      const denied = await login("invited@example.test", true);
      expect(denied.headers.get("location")).toContain("error=");
      expect((await db.query(`SELECT id FROM host_sessions WHERE "userId" = $1`, [session!.user.id])).rows).toHaveLength(1);
    } finally { network.mockRestore(); }
  });
});
