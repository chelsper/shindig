import "server-only";
import { neon } from "@neondatabase/serverless";
import type { HubContentPreview } from "../event-hub-preview";
import type { HubContentView } from "../event-hub-content";
import { getHostHubContentEvent } from "./host-hub-content";

// Not a public reader or server action. Resolve current ownership before any
// content query, never fall back to the legacy event, and never cache by slug.
export async function getHostHubPreview(id: string): Promise<HubContentPreview | null> {
  const event = await getHostHubContentEvent(id);
  if (!event) return null;
  const { slug, settings, publication } = event;
  const url = process.env.DATABASE_URL?.trim();
  async function section<K extends HubContentView>(key: K, read: () => Promise<HubContentPreview[K]["items"]>): Promise<HubContentPreview[K]> {
    const live = publication?.visibility === "published" && publication.snapshot.settings.features[key] === true;
    if (!settings.settings.features[key]) return { state: "disabled", live, items: [] } as HubContentPreview[K];
    try {
      if (!url) throw Error("Storage unavailable");
      return { state: "ready", live, items: await read() } as HubContentPreview[K];
    } catch { return { state: "unavailable", live, items: [] } as HubContentPreview[K]; }
  }
  // Each query deliberately omits publication gating: the owner may preview
  // prepared content before publishing. Row-level visibility rules still match
  // the guest readers. Private names, IDs, tokens and pending Q&A aren't read.
  const [potluck, polls, updates, questions] = await Promise.all([
    section("potluck", async () => {
      const rows = await neon(url!)`SELECT i.title, i.note, i.needed,
        coalesce((SELECT sum(c.quantity) FROM potluck_claims c WHERE c.item_id=i.id),0)::integer AS claimed
        FROM potluck_items i WHERE i.event_slug=${slug} AND NOT i.archived ORDER BY i.created_at,i.id LIMIT 50`;
      return rows.map(r => ({ title: String(r.title), note: String(r.note), needed: Number(r.needed), claimed: Number(r.claimed) }));
    }),
    section("polls", async () => {
      const rows = await neon(url!)`SELECT p.question, p.eyebrow, p.status, p.allow_multiple AS "allowMultiple", t.options,
        CASE WHEN p.status='CLOSED' AND p.show_closed_results THEN t.responses ELSE NULL END AS responses,
        CASE WHEN p.status='CLOSED' AND p.show_closed_results THEN t.counts ELSE NULL END AS counts
        FROM polls p JOIN shindig_poll_totals t ON t.poll_id=p.id
        WHERE p.event_slug=${slug} AND (p.status='OPEN' OR (p.status='CLOSED' AND p.show_closed_results))
        ORDER BY CASE WHEN p.status='OPEN' THEN 0 ELSE 1 END,p.sort_order,p.created_at DESC,p.id`;
      return rows.map(r => ({ question: String(r.question), eyebrow: r.eyebrow == null ? null : String(r.eyebrow),
        status: r.status as "OPEN" | "CLOSED", allowMultiple: Boolean(r.allowMultiple),
        responses: r.responses == null ? null : Number(r.responses),
        options: (Array.isArray(r.options) ? r.options : []).map(o => ({ text: String(o.text),
          count: r.counts == null ? null : Number((Array.isArray(r.counts) ? r.counts : []).find(c => c.key === o.key)?.count ?? 0),
        })),
      }));
    }),
    section("updates", async () => {
      const rows = await neon(url!)`SELECT heading,message,published_at AS "publishedAt" FROM event_updates
        WHERE event_slug=${slug} AND published_at IS NOT NULL ORDER BY published_at DESC,id DESC`;
      return rows.map(r => ({ heading: r.heading == null ? null : String(r.heading), message: String(r.message), publishedAt: new Date(r.publishedAt).toISOString() }));
    }),
    section("questions", async () => {
      const rows = await neon(url!)`SELECT question,answer FROM event_questions WHERE event_slug=${slug}
        AND is_published=true AND answer IS NOT NULL AND char_length(btrim(answer))>0 AND published_at IS NOT NULL
        ORDER BY published_at DESC,id DESC`;
      return rows.map(r => ({ question: String(r.question), answer: String(r.answer) }));
    }),
  ]);
  return { potluck, polls, updates, questions };
}
