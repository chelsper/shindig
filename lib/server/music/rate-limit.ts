import "server-only";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { MusicError } from "./provider";

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new MusicError("unavailable");
  return neon(url);
}

// Database-backed windows apply across Vercel instances, not just one process.
export async function consumeMusicQuota(key: string, limit: number, cooldownKey = "") {
  const sql = database();
  const rows = await sql`
    WITH expired AS (
      DELETE FROM music_request_limits WHERE expires_at < now() - interval '10 minutes'
        AND bucket_key <> ${key} AND bucket_key <> ${cooldownKey}
    ), counted AS (
      INSERT INTO music_request_limits (bucket_key, request_count, expires_at)
      VALUES (${key}, 1, now() + interval '60 seconds')
      ON CONFLICT (bucket_key) DO UPDATE SET
        request_count = CASE WHEN music_request_limits.expires_at <= now() THEN 1 ELSE music_request_limits.request_count + 1 END,
        expires_at = CASE WHEN music_request_limits.expires_at <= now() THEN now() + interval '60 seconds' ELSE music_request_limits.expires_at END
      RETURNING request_count, expires_at
    )
    SELECT request_count AS count,
      greatest(1, ceil(extract(epoch FROM (expires_at - now())))) AS retry,
      coalesce((SELECT greatest(0, ceil(extract(epoch FROM (expires_at - now()))))
        FROM music_request_limits WHERE bucket_key = ${cooldownKey}), 0) AS cooldown
    FROM counted
  `;
  if (!rows[0]) throw new MusicError("unavailable");
  const retry = Number(rows[0].cooldown) > 0 ? Number(rows[0].cooldown) : Number(rows[0].count) > limit ? Number(rows[0].retry) : 0;
  if (retry > 0) throw new MusicError("rate_limited", retry);
}

export async function throttleMusicRequest(kind: "search" | "add", headers: Pick<Headers, "get">) {
  // Trust only Vercel's supplied IP header in production. Local requests share a
  // bucket; user-controlled forwarded headers cannot mint unlimited buckets.
  const ip = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
  const digest = createHash("sha256").update(ip).digest("hex");
  await consumeMusicQuota(`${kind}:${digest}`, kind === "search" ? 60 : 20);
}

export async function blockMusicProvider(provider: string, seconds: number) {
  const sql = database();
  await sql`
    INSERT INTO music_request_limits (bucket_key, request_count, expires_at)
    VALUES (${`cooldown:${provider}`}, 0, now() + ${seconds} * interval '1 second')
    ON CONFLICT (bucket_key) DO UPDATE SET expires_at = greatest(music_request_limits.expires_at, excluded.expires_at)
  `;
}
