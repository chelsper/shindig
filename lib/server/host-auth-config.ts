import "server-only";

export type HostAuthConfiguration = {
  origin: string; secret: string; databaseUrl: string; clientId: string; clientSecret: string;
};

export function allowedHostEmail(email: string) {
  // Pilot access is explicit. Empty never means public registration.
  const allowed = (process.env.HOST_ALLOWED_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function hostAuthConfiguration(): HostAuthConfiguration | null {
  const origin = process.env.BETTER_AUTH_URL?.trim();
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!origin || !secret || secret.length < 32 || !databaseUrl || !clientId || !clientSecret) return null;
  try {
    const url = new URL(origin);
    // NextRequest canonicalizes numeric loopback hosts to localhost. Require that
    // same name in local OAuth config so redirect/origin checks stay exact.
    const local = process.env.NODE_ENV !== "production" && url.hostname === "localhost";
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { origin: url.origin, secret, databaseUrl, clientId, clientSecret };
  } catch { return null; }
}
