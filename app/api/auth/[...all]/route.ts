import { getHostAuth } from "../../../../lib/server/host-auth";
import { hostAuthConfiguration } from "../../../../lib/server/host-auth-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const failure = (status: number) => Response.json({ error: "Sign-in is unavailable. Please try again in a moment." }, { status, headers: privateHeaders });

async function handle(request: Request) {
  const config = hostAuthConfiguration();
  if (!config) return failure(503);
  const url = new URL(request.url);
  if (url.origin !== config.origin || request.url.length > 8192) return failure(400);
  const path = url.pathname.replace(/^\/api\/auth/, "");
  // Only OAuth and logout: no raw sessions, linking, password or profile APIs.
  if (request.method === "GET" ? path !== "/callback/google" : !["/sign-in/social", "/sign-out"].includes(path)) return failure(404);
  if (request.method === "POST") {
    if (request.headers.get("origin") !== config.origin || request.headers.get("sec-fetch-site") === "cross-site") return failure(403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(400);
    const reader = request.body?.getReader();
    if (!reader) return failure(400);
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > 4096) { await reader.cancel(); return failure(413); }
      parts.push(next.value);
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return failure(400); }
    if (!body || Array.isArray(body) || typeof body !== "object") return failure(400);
    if (path === "/sign-in/social") {
      if (Object.keys(body).length !== 1 || body.provider !== "google") return failure(400);
      body = { provider: "google", callbackURL: `${config.origin}/admin/events`, newUserCallbackURL: `${config.origin}/admin/events`, errorCallbackURL: `${config.origin}/host/sign-in?error=signin` };
    } else if (Object.keys(body).length) return failure(400);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    request = new Request(request.url, { method: "POST", headers, body: JSON.stringify(body) });
  }
  const auth = getHostAuth();
  if (!auth) return failure(503);
  const response = await auth.handler(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(privateHeaders)) headers.set(key, value);
  if (request.method === "POST" && response.ok) {
    // Choosing an account must not retain the legacy workspace authority.
    headers.append("Set-Cookie", `shindig_admin_session=; Path=/admin; Max-Age=0; HttpOnly; SameSite=Strict${config.origin.startsWith("https:") ? "; Secure" : ""}`);
  }
  return new Response(response.body, { status: response.status, headers });
}
async function safeHandle(request: Request) {
  try { return await handle(request); }
  catch { console.error("Host authentication request unavailable."); return failure(503); }
}
export const GET = safeHandle;
export const POST = safeHandle;
