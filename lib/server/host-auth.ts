import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { Pool } from "pg";
import { headers } from "next/headers";
import { allowedHostEmail, hostAuthConfiguration, type HostAuthConfiguration } from "./host-auth-config";

export function hostAuthOptions(database: Pool, config: HostAuthConfiguration): BetterAuthOptions {
  return {
    appName: "Shindig", baseURL: config.origin, basePath: "/api/auth", secret: config.secret,
    database, trustedOrigins: [config.origin], telemetry: { enabled: false },
    // Identity only. No Gmail, Calendar, contacts, offline access, or guest login.
    socialProviders: { google: { clientId: config.clientId, clientSecret: config.clientSecret, prompt: "select_account", accessType: "online", includeGrantedScopes: false } },
    emailAndPassword: { enabled: false },
    user: { modelName: "host_users", changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: { modelName: "host_sessions", expiresIn: 60 * 60 * 12, updateAge: 60 * 60, cookieCache: { enabled: false } },
    account: { modelName: "host_accounts", accountLinking: { enabled: false }, encryptOAuthTokens: true, storeAccountCookie: false },
    verification: { modelName: "host_verifications" },
    rateLimit: { enabled: true, storage: "database", modelName: "host_auth_rate_limits", window: 60, max: 60, customRules: { "/sign-in/social": { window: 60, max: 10 } } },
    advanced: {
      disableOriginCheck: false, disableCSRFCheck: false,
      cookiePrefix: "shindig-host", useSecureCookies: config.origin.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      crossSubDomainCookies: { enabled: false },
      ipAddress: { ipAddressHeaders: process.env.VERCEL === "1" ? ["x-vercel-forwarded-for"] : [] },
    },
    databaseHooks: {
      user: { create: { before: async (user) => {
        if (!user.emailVerified || !allowedHostEmail(user.email)) return false;
        return { data: { ...user, image: null } };
      } } },
      session: { create: { before: async (session, context) => {
        const user = await context?.context.internalAdapter.findUserById(session.userId);
        if (!user?.emailVerified || !allowedHostEmail(user.email)) return false;
      } } },
      // Provider tokens are not needed after establishing the Google identity.
      account: {
        create: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null } }) },
        update: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null } }) },
      },
    },
    onAPIError: { errorURL: `${config.origin}/host/sign-in?error=signin` },
    // Never log provider responses, tokens, database URLs, or personal data.
    logger: { disabled: true },
  } satisfies BetterAuthOptions;
}

let instance: ReturnType<typeof betterAuth> | undefined;
export function getHostAuth() {
  const config = hostAuthConfiguration();
  if (!config) return null;
  if (!instance) {
    const pool = new Pool({ connectionString: config.databaseUrl, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 7000 });
    pool.on("error", () => console.error("Host authentication storage connection unavailable."));
    const created = betterAuth(hostAuthOptions(pool, config));
    instance = created;
    // A cold-start database outage must not poison every retry on this instance.
    void created.$context.catch(() => {
      if (instance === created) instance = undefined;
      void pool.end().catch(() => {});
    });
  }
  return instance;
}

export async function getHostAccountSession() {
  if (!hostAuthConfiguration()) return null;
  const requestHeaders = await headers();
  // Anonymous guests/sign-in pages must not open an auth database connection.
  // This is only an early rejection; Better Auth still verifies any cookie.
  if (!/(?:^|;\s*)(?:__Secure-)?shindig-host\.session_token=/.test(requestHeaders.get("cookie") ?? "")) return null;
  const auth = getHostAuth();
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
  if (!session || !session.user.emailVerified || !allowedHostEmail(session.user.email)) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}
