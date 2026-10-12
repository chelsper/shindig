import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { HostingOverview } from "../hosting-overview";
import { eventScopeSlug, getHostDraftScope, requireHostEventScope } from "./event-scope";
import { getRsvpSummary } from "./rsvps";

// Private aggregate reader only: no public route, server action, guest identity
// projection or cross-request cache. Resolve current ownership before any totals.
export async function getHostingOverview(id: string): Promise<HostingOverview | null> {
  const scope = await getHostDraftScope(id);
  if (!scope) return null;
  await requireHostEventScope(scope);
  const slug = eventScopeSlug(scope);
  const url = process.env.DATABASE_URL?.trim();
  async function counts<K extends string>(keys: readonly K[], read: (sql: NeonQueryFunction<false, false>) => Promise<Record<string, unknown>[]>): Promise<Record<K, number> | null> {
    try {
      if (!url) throw Error("Storage unavailable");
      const [row] = await read(neon(url));
      const result = {} as Record<K, number>;
      for (const key of keys) {
        if (row?.[key] == null) throw Error("Missing total");
        const value = Number(row[key]);
        if (!Number.isSafeInteger(value) || value < 0) throw Error("Invalid total");
        result[key] = value;
      }
      return result;
    } catch { return null; }
  }
  // Independent reads keep a missing optional module from hiding RSVP totals.
  // Read retained activity even if a feature was switched off; label visibility
  // using the saved and published settings in the host-only presentation.
  const [rsvps, potluck, questions, playlist, polls, updates] = await Promise.all([
    getRsvpSummary(scope).catch(() => null),
    counts(["items", "needed", "covered", "remaining", "uncoveredItems"], sql => sql`
      WITH requests AS (
        SELECT i.needed, coalesce(sum(c.quantity),0) AS claimed
        FROM potluck_items i LEFT JOIN potluck_claims c ON c.item_id=i.id AND c.event_slug=i.event_slug
        WHERE i.event_slug=${slug} AND NOT i.archived GROUP BY i.id,i.needed
      )
      SELECT count(*)::int AS items, coalesce(sum(needed),0)::int AS needed,
        coalesce(sum(least(needed,claimed)),0)::int AS covered,
        coalesce(sum(greatest(0,needed-claimed)),0)::int AS remaining,
        count(*) FILTER (WHERE claimed<needed)::int AS "uncoveredItems" FROM requests`),
    counts(["total", "unanswered", "answeredPrivate", "approved"], sql => sql`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE answer IS NULL OR char_length(btrim(answer))=0)::int AS unanswered,
        count(*) FILTER (WHERE char_length(btrim(answer))>0 AND (NOT is_published OR published_at IS NULL))::int AS "answeredPrivate",
        count(*) FILTER (WHERE char_length(btrim(answer))>0 AND is_published AND published_at IS NOT NULL)::int AS approved
      FROM event_questions WHERE event_slug=${slug}`),
    counts(["total"], sql => sql`SELECT count(*)::int AS total FROM playlist_suggestions WHERE event_slug=${slug}`),
    counts(["total", "open", "drafts", "closed"], sql => sql`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='OPEN')::int AS open, count(*) FILTER (WHERE status='DRAFT')::int AS drafts,
      count(*) FILTER (WHERE status='CLOSED')::int AS closed FROM polls WHERE event_slug=${slug}`),
    counts(["total"], sql => sql`SELECT count(*)::int AS total FROM event_updates WHERE event_slug=${slug}`),
  ]);
  return { checkedAt: Date.now(), rsvps, potluck, questions, playlist, polls, updates };
}
